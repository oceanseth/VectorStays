<?php
require_once (__DIR__."/../tools/db.php");
require_once (__DIR__."/../tools/Guesty.php");

require_once("getListings.php");

if(!$g) $g = new Guesty(GUESTY_KEY,GUESTY_SECRET);
$listingCalendarCount=0;
$listingCalendarsAffected=0;
$listingIds = array_chunk($listingIds,10);

$last_run_sub_30 = date("Y-m-d",strtotime($last_run) - 60*60*24*30);

foreach($listingIds as $l) {
    $calendarentries = $g->getListingCalendars($l, $last_run_sub_30);
    if(!$calendarentries) continue;
    echo 'got '.count($calendarentries)." listingscalendar entries";
    if(count($calendarentries)==0) continue;
    $listingCalendarCount++;
    $listingCalendarsAffected+=Guesty::insertListingCalendars($calendarentries);
}

if(isset($synclogfilename)) {
    file_put_contents($synclogfilename,"-- Modified $listingCalendarsAffected / $listingCalendarCount ListingCalendar Entries --",FILE_APPEND);
}