<?php
require_once(__DIR__."/../tools/GoogleClient.php");

// Get the API client and construct the service object.
$client = getGoogleClient();
$service = new Google_Service_Gmail($client);

$gw = new Google_Service_Gmail_WatchRequest();
$gw->topicName="projects/revestmentemailhook/topics/guesty";

$results = $service->users->watch(HOOKS_EMAIL,$gw);
print_r($results);