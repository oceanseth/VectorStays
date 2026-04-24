<?php
require_once(__DIR__ . "/config.php");

/**
 * Minimal Firebase Admin shim.
 *
 *  - mintCustomToken($uid, $claims)  : RS256-signed JWT for the client to
 *                                       pass to firebase.auth().signInWithCustomToken().
 *  - rtdb($path, $data, $method)      : write to Firebase Realtime DB using a
 *                                       server OAuth token derived from the
 *                                       service account.
 *
 * No external library dependency — uses openssl + curl directly.
 *
 * If FIREBASE_SERVICE_ACCOUNT_PATH is unset or the file is missing, these
 * functions return null silently so the rest of the app keeps working; the
 * UI falls back to polling.
 */
class Firebase
{
    private static $sa = null;     // decoded service account json
    private static $accessToken = null;
    private static $accessExp = 0;

    public static function isConfigured()
    {
        return defined('FIREBASE_SERVICE_ACCOUNT_PATH')
            && FIREBASE_SERVICE_ACCOUNT_PATH
            && file_exists(FIREBASE_SERVICE_ACCOUNT_PATH);
    }

    private static function sa()
    {
        if (self::$sa !== null) return self::$sa;
        if (!self::isConfigured()) return self::$sa = false;
        $raw = file_get_contents(FIREBASE_SERVICE_ACCOUNT_PATH);
        $parsed = json_decode($raw, true);
        if (!$parsed || empty($parsed['private_key']) || empty($parsed['client_email'])) {
            error_log("Firebase: service account at " . FIREBASE_SERVICE_ACCOUNT_PATH . " is malformed");
            return self::$sa = false;
        }
        return self::$sa = $parsed;
    }

    private static function b64url($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function signJwt(array $header, array $payload, $privateKey) {
        $segments = self::b64url(json_encode($header)) . '.' . self::b64url(json_encode($payload));
        $sig = '';
        if (!openssl_sign($segments, $sig, $privateKey, 'SHA256')) {
            error_log("Firebase: openssl_sign failed: " . openssl_error_string());
            return null;
        }
        return $segments . '.' . self::b64url($sig);
    }

    /**
     * Mint a Firebase custom token for a PHP User. $uid must be a string
     * (we pass the MySQL user_id as a string). $claims go into the token.
     */
    public static function mintCustomToken($uid, array $claims = [])
    {
        $sa = self::sa();
        if (!$sa) return null;

        $now = time();
        $header  = ['alg' => 'RS256', 'typ' => 'JWT'];
        $payload = [
            'iss'    => $sa['client_email'],
            'sub'    => $sa['client_email'],
            'aud'    => 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
            'uid'    => (string)$uid,
            'iat'    => $now,
            'exp'    => $now + 3600, // max allowed by Firebase for custom tokens
            'claims' => $claims,
        ];
        return self::signJwt($header, $payload, $sa['private_key']);
    }

    /**
     * Get (and cache) a Google OAuth access token for Firebase RTDB scope.
     * Uses the service account's JWT grant flow.
     */
    private static function getAccessToken()
    {
        if (self::$accessToken && self::$accessExp > time() + 30) return self::$accessToken;
        $sa = self::sa();
        if (!$sa) return null;

        $now = time();
        $assertion = self::signJwt(
            ['alg' => 'RS256', 'typ' => 'JWT'],
            [
                'iss'   => $sa['client_email'],
                'scope' => 'https://www.googleapis.com/auth/firebase.database '
                         . 'https://www.googleapis.com/auth/userinfo.email',
                'aud'   => 'https://oauth2.googleapis.com/token',
                'iat'   => $now,
                'exp'   => $now + 3600,
            ],
            $sa['private_key']
        );
        if (!$assertion) return null;

        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $assertion,
        ]));
        $resp = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($status >= 400) {
            error_log("Firebase: token exchange failed $status: $resp");
            return null;
        }
        $decoded = json_decode($resp, true);
        if (empty($decoded['access_token'])) return null;
        self::$accessToken = $decoded['access_token'];
        self::$accessExp = $now + (int)($decoded['expires_in'] ?? 3600);
        return self::$accessToken;
    }

    /**
     * Write to Realtime DB. $path e.g. "/calls/call_abc/meta" (no leading
     * database URL, no .json suffix — we add both). $method can be PUT,
     * PATCH, POST, DELETE.
     * Returns decoded JSON body on success, null on failure.
     */
    public static function rtdb($path, $data = null, $method = 'PUT')
    {
        if (!self::isConfigured() || !defined('FIREBASE_DATABASE_URL') || !FIREBASE_DATABASE_URL) {
            return null;
        }
        $token = self::getAccessToken();
        if (!$token) return null;

        $url = rtrim(FIREBASE_DATABASE_URL, '/') . '/' . ltrim($path, '/') . '.json';
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'authorization: Bearer ' . $token,
            'content-type: application/json',
        ]);
        if ($data !== null && $method !== 'DELETE') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        $resp = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($status >= 400) {
            error_log("Firebase rtdb $method $path failed ($status): $resp");
            return null;
        }
        return json_decode($resp, true);
    }
}
