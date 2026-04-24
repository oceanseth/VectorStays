<?php
require_once (__DIR__."/../tools/db.php");
require_once (__DIR__."/../tools/Guesty.php");
if(!isset($g)) 
{
    $db->select_db("vector");
    $g = new Guesty();
}

$listingsBeforeUpdate = $db->fetchOne("SELECT COUNT(_id) AS `count` FROM Listing");
$listings = $g->getListings();
$result = Guesty::insertListings($listings);

$listingIds = array();
foreach($listings as $l) {
    $listingIds[]=$l->_id;
}
$listingsCount = $result["listingsCount"];
$listingsAffected = $result["listingsAffected"];

if(isset($synclogfilename)) {
    file_put_contents($synclogfilename,"-- Modified $listingsAffected / $listingsCount Listings --",FILE_APPEND);
}
/*
if ( $listingsAffected > 0) {
    $listingsAfterUpdate = $db->fetchOne("SELECT COUNT(_id) AS `count` FROM Listing");
    $newListings = (int)$listingsBeforeUpdate->count < (int)$listingsAfterUpdate->count;
    if ($newListings) {
        $db->query('TRUNCATE TABLE monthlyCachedAnalytics');
    }
}
*/
