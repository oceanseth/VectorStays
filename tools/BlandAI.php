<?php
require_once(__DIR__ . "/config.php");

class BlandAI
{
    public static function request($path, $method = 'GET', $body = null)
    {
        $ch = curl_init(BLAND_AI_API . ltrim($path, '/'));
        $headers = [
            "authorization: " . BLAND_AI_API_KEY,
            "content-type: application/json",
        ];
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($body) ? $body : json_encode($body));
        }
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            error_log("BlandAI curl error: $err (path=$path)");
            return null;
        }
        $decoded = json_decode($response);
        if ($status >= 400) {
            error_log("BlandAI $method $path returned $status: " . $response);
        }
        return $decoded;
    }

    /** Fetch bland's view of a call — returns null if not found. */
    public static function getCall($callId)
    {
        return self::request("calls/" . urlencode($callId), 'GET');
    }

    /**
     * Mint a listen-session URL. Browser connects directly to this wss:// URL
     * to stream PCM16@16kHz audio (read-only).
     */
    public static function createListenSession($callId)
    {
        $resp = self::request("calls/" . urlencode($callId) . "/listen", 'POST');
        return isset($resp->url) ? $resp->url : null;
    }

    /**
     * Warm-transfer the live call to a phone number.
     * E.164 expected; bland will dial that number, brief the agent, then merge.
     */
    public static function warmTransfer($callId, $phoneE164)
    {
        return self::request("calls/" . urlencode($callId) . "/transfer", 'POST', [
            'phone_number' => $phoneE164,
            'warm_transfer_message' => 'A support agent is joining the call now.',
        ]);
    }

    /** Update the inbound DID's configuration (prompt, webhook, tools, etc.). */
    public static function updateInbound($phoneE164, $config)
    {
        return self::request("inbound/" . urlencode($phoneE164), 'POST', $config);
    }
}
