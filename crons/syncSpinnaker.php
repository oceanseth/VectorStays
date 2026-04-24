<?php
chdir(__DIR__);
require_once("../tools/db.php");
require_once("../tools/api_functions.php");
require_once("../tools/SpinnakerAPI.php");
require_once("../tools/Guesty.php");

/* cant do this have to do both, otherwise we will open up units when we shouldn't
$filename = 'lastSpinnakerSync';
$s = file_get_contents($filename);
if($s=='') $s='2000-01-01';
$oldDay = date('d',strtotime($s));
file_put_contents($filename,date("Y-m-d H:i:s"));
if($oldDay!=date('d')) {
    SpinnakerAPI::syncReservations();
}
*/
/*
SpinnakerAPI::syncReservations();
SpinnakerAPI::syncAvailability();
*/
SpinnakerAPI::blockAllListingsAvailability();