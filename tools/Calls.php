<?php
require_once(__DIR__ . "/db.php");
require_once(__DIR__ . "/BlandAI.php");
require_once(__DIR__ . "/Firebase.php");

class Calls
{
    /**
     * Normalize a phone string to something we can compare against Guest.phone.
     * Guesty stores phones in mixed formats; we do a loose digit-match.
     */
    public static function phoneDigits($phone)
    {
        return preg_replace('/\D+/', '', (string)$phone);
    }

    /**
     * Look up the most relevant reservation/guest context for an inbound caller.
     * Matches Guest.phone on a digit-only suffix (last 10) to cope with +1,
     * parentheses, dashes, and country-code variations stored by Guesty.
     *
     * Returns null if no match, otherwise: { guest, reservation, listing }.
     * Prefers the active (current check-in today) reservation; falls back to
     * the nearest upcoming check-in; finally the most recent past stay.
     */
    public static function lookupCallerContext($fromNumber)
    {
        global $db;
        $digits = self::phoneDigits($fromNumber);
        if (strlen($digits) < 7) return null;
        $suffix = substr($digits, -10);

        $guest = $db->fetchOne(
            "SELECT _id, firstName, lastName, phone, email, airbnb_url
             FROM Guest
             WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'+',''),'-',''),' ',''),'(',''),')','')
                   LIKE " . s('%' . $suffix) . "
             LIMIT 1"
        );
        if (!$guest) return null;

        $today = date('Y-m-d');
        $res = $db->fetchOne(
            "SELECT _id, listingId, checkIn, checkOut, status, confirmationCode, guestsCount
             FROM Reservation
             WHERE guestId = " . s($guest->_id) . "
               AND status IN ('confirmed','inquiry','new')
               AND checkOut >= " . s($today) . "
             ORDER BY ABS(DATEDIFF(checkIn, " . s($today) . ")) ASC
             LIMIT 1"
        );
        if (!$res) {
            $res = $db->fetchOne(
                "SELECT _id, listingId, checkIn, checkOut, status, confirmationCode, guestsCount
                 FROM Reservation
                 WHERE guestId = " . s($guest->_id) . "
                 ORDER BY checkOut DESC
                 LIMIT 1"
            );
        }

        $listing = null;
        if ($res && $res->listingId) {
            $listing = $db->fetchOne(
                "SELECT _id, nickname, title, address_full, address_city, address_state,
                        defaultCheckInTime, defaultCheckOutTime, picture
                 FROM Listing
                 WHERE _id = " . s($res->listingId) . "
                 LIMIT 1"
            );
        }

        return (object)[
            'guest'       => $guest,
            'reservation' => $res ?: null,
            'listing'     => $listing ?: null,
        ];
    }

    /** Upsert a Call row keyed by bland's call_id. Mirrors meta to Firebase. */
    public static function upsertCall($callId, $fields)
    {
        global $db;
        $existing = $db->fetchOne("SELECT _id FROM `Call` WHERE _id = " . s($callId));
        if ($existing) {
            $sets = [];
            foreach ($fields as $k => $v) $sets[] = "`$k` = " . s($v);
            if (!$sets) return;
            $db->query("UPDATE `Call` SET " . implode(',', $sets) . " WHERE _id = " . s($callId));
        } else {
            $cols = array_keys($fields);
            $vals = array_map(function ($v) { return s($v); }, array_values($fields));
            array_unshift($cols, '_id');
            array_unshift($vals, s($callId));
            $db->query("INSERT INTO `Call` (`" . implode('`,`', $cols) . "`) VALUES (" . implode(',', $vals) . ")");
        }
        // Mirror to Firebase so the portal sees live changes without polling.
        Firebase::rtdb("/calls/" . $callId . "/meta", array_merge($fields, ['updated_at' => date('c')]), 'PATCH');
    }

    /**
     * Create a transfer request for an active call. Returns the Slack-safe short code
     * (used as both URL hash and DB key). Caller is expected to POST the Slack message
     * separately and then call setTransferSlackMessage() with the ts.
     */
    public static function createTransferRequest($callId, $reason = null, $ttlSeconds = 600)
    {
        global $db;
        // 8-char URL-safe code drawn from alphabet that's unambiguous on phones/Slack
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $code = '';
            for ($i = 0; $i < 8; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            $clash = $db->fetchOne("SELECT transfer_id FROM TransferRequest WHERE code = " . s($code));
        } while ($clash);

        $expires = date('Y-m-d H:i:s', time() + $ttlSeconds);
        $db->query("INSERT INTO TransferRequest (code, call_id, reason, expires_at)
                    VALUES (" . s($code) . ", " . s($callId) . ", " . s($reason) . ", " . s($expires) . ")");

        // Mirror to Firebase so any logged-in portal sees the new pending transfer immediately.
        Firebase::rtdb("/transfers/" . $code, [
            'call_id'      => $callId,
            'reason'       => $reason,
            'status'       => 'pending',
            'requested_at' => date('c'),
            'expires_at'   => date('c', time() + $ttlSeconds),
        ], 'PUT');

        return $code;
    }

    public static function setTransferSlackMessage($code, $channelId, $messageTs)
    {
        global $db;
        $db->query("UPDATE TransferRequest
                    SET slack_channel_id = " . s($channelId) . ",
                        slack_message_ts = " . s($messageTs) . "
                    WHERE code = " . s($code));
    }

    /** Post a transfer alert to Slack. Returns the message ts or null on failure/stub. */
    public static function postSlackTransferAlert($code, $ctx, $reason)
    {
        if (!defined('SLACK_BOT_TOKEN') || !SLACK_BOT_TOKEN || !SLACK_ALERT_CHANNEL_ID) {
            error_log("Slack not configured; skipping transfer alert for code=$code");
            return null;
        }
        $portalUrl = VECTORSTAYS_PORTAL_HOST . '/#call-' . $code;
        $who = ($ctx && $ctx->guest)
            ? trim($ctx->guest->firstName . ' ' . $ctx->guest->lastName) . ' (' . $ctx->guest->phone . ')'
            : 'Unknown caller';
        $listing = ($ctx && $ctx->listing) ? ($ctx->listing->nickname ?: $ctx->listing->title) : 'No matched listing';
        $text = "Transfer requested from $who — $listing";

        $payload = [
            'channel' => SLACK_ALERT_CHANNEL_ID,
            'text'    => $text,
            'blocks'  => [
                ['type' => 'section', 'text' => ['type' => 'mrkdwn', 'text' => "*Support transfer requested*\n*Caller:* $who\n*Listing:* $listing\n*Code:* `$code`"]],
                ['type' => 'section', 'text' => ['type' => 'mrkdwn', 'text' => $reason ? "*Reason:* " . $reason : '_No reason provided_']],
                ['type' => 'actions', 'elements' => [[
                    'type' => 'button',
                    'text' => ['type' => 'plain_text', 'text' => 'Join call'],
                    'url'  => $portalUrl,
                    'style' => 'primary',
                ]]],
            ],
        ];

        $ch = curl_init('https://slack.com/api/chat.postMessage');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'authorization: Bearer ' . SLACK_BOT_TOKEN,
            'content-type: application/json; charset=utf-8',
        ]);
        $res = curl_exec($ch);
        curl_close($ch);
        $decoded = json_decode($res);
        if (!$decoded || empty($decoded->ok)) {
            error_log("Slack postMessage failed: $res");
            return null;
        }
        return $decoded->ts;
    }

    /** Replace the full transcript for a call. */
    public static function setTranscript($callId, array $chunks)
    {
        global $db;
        $db->query("UPDATE `Call` SET transcript_json = " . s(json_encode($chunks)) . ",
                    updated_at = NOW() WHERE _id = " . s($callId));
        Firebase::rtdb("/calls/" . $callId . "/transcript", $chunks, 'PUT');
    }

    /** Append a single transcript turn. */
    public static function appendTranscript($callId, $role, $text, $timestamp = null)
    {
        global $db;
        $call = $db->fetchOne("SELECT transcript_json FROM `Call` WHERE _id = " . s($callId));
        $chunks = ($call && $call->transcript_json)
            ? (json_decode($call->transcript_json, true) ?: [])
            : [];
        $chunks[] = [
            'role' => $role,
            'text' => $text,
            'at'   => $timestamp ?: date('c'),
        ];
        self::setTranscript($callId, $chunks);
    }
}
