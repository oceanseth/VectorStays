<?php
require_once (__DIR__."/../tools/db.php");
require_once (__DIR__."/../tools/Guesty.php");

$db->select_db("stayintel");
$projects = $db->fetchAll("select id, name from domains");

foreach($projects as  $project) {
    $p = $project->name;
    $db->select_db($p);

    $integrations = $db->fetchAll("select * from Integration where type='guesty'");
    foreach ($integrations as $i) {
        $filename = __DIR__."/lastrun_".$p.'_'.$i->_id;
        $synclogfilename = __DIR__."/synclog_".$p."_".$i->_id.".log";

        $msg = "\r\n\r\nSyncing guesty for project $p integration ".$i->_id." on [" . date("Y-m-d H:i:s");
        echo $msg;
        file_put_contents($synclogfilename, $msg, FILE_APPEND);
        if (file_exists($filename)) {
            $last_run = file_get_contents($filename);
            $last_run = substr($last_run,0,10);
        } else {
            $last_run = '1999-01-01';
        }

        $GUESTY_KEY = $i->username;
	$GUESTY_SECRET = $i->password;
	$GUESTY_TOKEN = $i->token;
        $CURRENT_USER_ID = $project->id;
        $g = new Guesty($GUESTY_KEY, $GUESTY_SECRET,$GUESTY_TOKEN);
//        include('getReservations.php');
	echo 'finished getReservations.\n';
	include('getListings.php');
	echo 'finished getListings \n';
	include('getListingCalendars.php');
	echo 'finished getListingCalendars\n';
	include('getGuests.php');
	echo 'finished getGuests.php';
        file_put_contents($filename, date("Y-m-d H:i:s",time()-60*60*24));
    }

    $db->query("update Listing set lastActiveDate = (select MAX(date) from ListingCalendar
 where listingId=Listing._id and status='booked')");
    $db->query("update Reservation set confirmedAt = IFNULL(LEAST(lastUpdatedAt,checkIn),checkIn) 
where confirmedAt is null OR confirmedAt>checkIn");
    $db->query("update Listing set leaseStartDate=(select MIN(date) from ListingCalendar where listingId=Listing._id and status='booked') where Listing.leaseStartDate is null");

}
