<?php
require_once (__DIR__."/../tools/db.php");
require_once (__DIR__."/../tools/Guesty.php");

$unknownGuestIds=$db->fetchAll("select guestId from Reservation 
inner join Guest on Guest._id=guestId 
where (firstName is null OR firstName ='' OR lastName='' ) and guestId!='' 
order by Reservation._id");
$guestIds=array();
$guestCount=0;
foreach($unknownGuestIds as $guest){
    $guestIds[]=$guest->guestId;
}
if(!isset($g)) $g = new Guesty();

    $guests = $g->getGuests($guestIds);
    $chunks = array_chunk($guests,500);
    foreach($chunks as $guestChunks) {
        Guesty::insertGuests($guestChunks);
    }

if(isset($synclogfilename)) {
    file_put_contents($synclogfilename,"-- Added $guestCount guests --",FILE_APPEND);
}