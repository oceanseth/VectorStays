<?php
// This will simply invoke the api loadUser for every user in the system

require __DIR__.'/../tools/config.php';
require __DIR__.'/../tools/db.php';
require __DIR__.'/../tools/api_functions.php';


$db->select_db("stayintel");
$domains = $db->fetchAll('select name from domains');
if(false) //set to true for QA testing
    $domains=[(object)['name'=>'qa']];

foreach($domains as $d) {
    $db->select_db($d->name);
    $users = $db->fetchAll('select role,user_id, commission from User');
    foreach($users as $user) {
        unlink(__DIR__.'/../cache/'.$user->user_id.'_loaduser');
        echo "Generating user cache for ".$user->user_id . ' from ' . $d->name . PHP_EOL;
        $uid = $user_id;
        loadUser();
    }
}
?>

