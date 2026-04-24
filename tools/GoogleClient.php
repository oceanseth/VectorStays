<?php

require __DIR__ . '/../vendor/autoload.php';
require_once("config.php");
/**
* Returns an authorized API client.
* @return Google_Client the authorized client object
*/
function getGoogleClient()
{
    $client = new Google_Client();
    $client->setApplicationName('RevestmentEmailHook');
    $client->setScopes(Google_Service_Gmail::MAIL_GOOGLE_COM);
    $client->setAuthConfig(__DIR__.'/google_client_secret.json');
    $client->setAccessType('offline');
    // Load previously authorized credentials from a file.
    $credentialsPath = __DIR__.'/credentials.json';
    if (file_exists($credentialsPath)) {
        $accessToken = json_decode(file_get_contents($credentialsPath), true);
    } else {
        // Request authorization from the user.
        $authUrl = $client->createAuthUrl();
        printf("Open the following link in your browser:\n%s\n", $authUrl);
        print 'Enter verification code: ';
        $authCode = trim(fgets(STDIN));

        // Exchange authorization code for an access token.
        $accessToken = $client->fetchAccessTokenWithAuthCode($authCode);

        // Store the credentials to disk.
        if (!file_exists(dirname($credentialsPath))) {
            mkdir(dirname($credentialsPath), 0700, true);
        }
        file_put_contents($credentialsPath, json_encode($accessToken));
        printf("Credentials saved to %s\n", $credentialsPath);
    }
    $client->setAccessToken($accessToken);

    // Refresh the token if it's expired.
    if ($client->isAccessTokenExpired()) {
        error_log("access token was expired, getting new.");
        $client->fetchAccessTokenWithRefreshToken($client->getRefreshToken());
        file_put_contents($credentialsPath, json_encode($client->getAccessToken()));
    }
    return $client;
}