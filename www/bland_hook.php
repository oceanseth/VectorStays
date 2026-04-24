<?php
require_once("../tools/db.php");
require_once("../tools/Calls.php");
require_once("../tools/BlandAI.php");

/**
 * Webhook receiver for bland.ai.
 *
 * Bland's webhook contract is flat and a bit freeform — it sends the final call
 * payload to the configured webhook URL at call end and can optionally stream
 * mid-call events (transcript turns, status changes). We accept both shapes.
 *
 * Also doubles as the target for bland's custom-tool "request_human_transfer":
 * bland can POST here with ?event=transfer_request when its agent decides a
 * human is needed. We return JSON so the tool can relay the response to the
 * caller ("A human has been notified, stay on the line...").
 */

$raw = file_get_contents('php://input');
$data = json_decode($raw);

// Log every hook for forensics — same pattern as guesty_hook.
$db->query("INSERT INTO HookHistory (_id, datetime, body) VALUES (0, NOW(), " . s($raw) . ")");

header('Content-Type: application/json');

// Event routing. Bland doesn't send an `event` field for post-call webhooks, so we
// infer from fields present; the transfer tool will pass ?event=transfer_request.
$event = $_REQUEST['event'] ?? ($data->event ?? null);

if (!$event) {
    if (isset($data->completed) && $data->completed) {
        $event = 'call.completed';
    } elseif (isset($data->transcripts) || isset($data->transcript)) {
        $event = 'call.transcript';
    } elseif (isset($data->call_id)) {
        $event = 'call.started';
    }
}

switch ($event) {
    case 'transfer_request': {
        // Bland's custom tool hits this when the AI agent wants a human.
        $callId = $data->call_id ?? $_REQUEST['call_id'] ?? null;
        $reason = $data->reason  ?? $_REQUEST['reason']  ?? null;
        if (!$callId) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'missing call_id']);
            exit;
        }

        // Make sure we have a Call row so the portal has something to show.
        $existing = $db->fetchOne("SELECT _id FROM `Call` WHERE _id = " . s($callId));
        if (!$existing) {
            $remote = BlandAI::getCall($callId);
            Calls::upsertCall($callId, [
                'from_number' => $remote->from ?? null,
                'to_number'   => $remote->to   ?? BLAND_AI_INBOUND_NUMBER,
                'started_at'  => date('Y-m-d H:i:s'),
                'status'      => 'in_progress',
            ]);
        }
        $ctx = null;
        $fromNum = $data->from ?? ($existing->from_number ?? null);
        if (!$fromNum) {
            $c = $db->fetchOne("SELECT from_number FROM `Call` WHERE _id = " . s($callId));
            $fromNum = $c ? $c->from_number : null;
        }
        if ($fromNum) $ctx = Calls::lookupCallerContext($fromNum);

        $code = Calls::createTransferRequest($callId, $reason);
        $ts = Calls::postSlackTransferAlert($code, $ctx, $reason);
        if ($ts) Calls::setTransferSlackMessage($code, SLACK_ALERT_CHANNEL_ID, $ts);

        echo json_encode([
            'ok'   => true,
            'code' => $code,
            'say'  => 'I have notified a human agent. They will join shortly — please stay on the line.',
        ]);
        break;
    }

    case 'call.started': {
        $callId = $data->call_id ?? null;
        if (!$callId) { echo json_encode(['ok' => false]); break; }
        Calls::upsertCall($callId, [
            'from_number' => $data->from ?? null,
            'to_number'   => $data->to   ?? BLAND_AI_INBOUND_NUMBER,
            'started_at'  => date('Y-m-d H:i:s'),
            'status'      => 'in_progress',
        ]);
        echo json_encode(['ok' => true]);
        break;
    }

    case 'call.transcript': {
        $callId = $data->call_id ?? null;
        if (!$callId) { echo json_encode(['ok' => false]); break; }
        // Bland sends either a streaming chunk { role, text } or a full array.
        if (isset($data->transcripts) && is_array($data->transcripts)) {
            Calls::setTranscript($callId, $data->transcripts);
        } elseif (isset($data->role) && isset($data->text)) {
            Calls::appendTranscript($callId, $data->role, $data->text, $data->timestamp ?? null);
        }
        echo json_encode(['ok' => true]);
        break;
    }

    case 'call.completed':
    case 'call.ended': {
        $callId = $data->call_id ?? null;
        if (!$callId) { echo json_encode(['ok' => false]); break; }
        Calls::upsertCall($callId, [
            'from_number'   => $data->from ?? null,
            'ended_at'      => date('Y-m-d H:i:s'),
            'status'        => ($data->status ?? 'completed'),
            'summary'       => $data->summary ?? null,
            'recording_url' => $data->recording_url ?? null,
        ]);
        if (isset($data->transcripts) && is_array($data->transcripts)) {
            Calls::setTranscript($callId, $data->transcripts);
        }
        echo json_encode(['ok' => true]);
        break;
    }

    default:
        error_log("bland_hook: unknown event '$event' body=" . substr($raw, 0, 500));
        echo json_encode(['ok' => true, 'ignored' => $event]);
}
