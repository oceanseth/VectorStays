<?php
require_once (__DIR__."/../tools/db.php");
require_once (__DIR__."/../tools/Guesty.php");

if (!defined('BNBTRACKER_URL')) {
    define('BNBTRACKER_URL', 'https://bnbtracker.stayintel.com/api/');
}

if(!isset($g)) {
	echo 'loadin custom sync getRservations';
        Guesty::setupCustomForSync();
}
$reservationsCount=0;
$reservationsAffected=0;

while($reservations = $g->getReservations($last_run)) {
    $count = count($reservations);
    if ( $count <= 0) break;
    $reservationsCount+=$count;
    $reservationsAffected+=Guesty::insertReservations($reservations);
}
/*
// fetch reservations confirmed within the last two days
$reservationsWithoutCompadr = $db->fetchAll("select Listing.airbnb_id, Listing._id as listingId,
    Reservation._id, Reservation.checkIn, Reservation.checkOut
    from Reservation
    inner join Listing on Listing._id = Reservation.listingId
    where DATEDIFF(CURDATE(), DATE(Reservation.confirmedAt)) < 2 and 
    Reservation.status='confirmed' and
    Reservation.compadr is null
    ");

if (count($reservationsWithoutCompadr) > 0) {

    $listingsWithReservations = array_map(function ($r) {
        return array(
            'airbnb_id' => $r->airbnb_id,
            'reservation_id' => $r->_id,
            'check_in' => $r->checkIn,
            'check_out' => $r->checkOut
        );
    }, $reservationsWithoutCompadr);
   /* 
    $data = http_build_query(
                    array(
                        'method' => 'getCompAveragesIfAvailable',
                        'user_id' => $CURRENT_USER_ID,
                        'listing_ids' => array_column($listingsWithReservations, 'airbnb_id'),
                        'starts' => array_column($listingsWithReservations, 'check_in'),
                        'ends' => array_column($listingsWithReservations, 'check_out')
                    )
                );

    $ch = curl_init(BNBTRACKER_URL);

    $options = array(
        CURLOPT_HTTPHEADER => array(
            'Accept: application/json',
            'Content-Type: application/x-www-form-urlencoded'
        ),
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $data,
        CURLOPT_RETURNTRANSFER => true
    );

    curl_setopt_array($ch, $options);
    
    $result = curl_exec($ch);

    curl_close($ch);

    $compadrs = json_decode($result, true);
    
    $averages = array_map(function ($r, $average) {
        $compadr = isset($average['compadr']) ? $average['compadr'] : 0 ;
        $reservationId = $r['reservation_id'];
        return "('$reservationId',$compadr)";
    }, $listingsWithReservations, $compadrs);

    $values = implode(',', $averages);
    
    $sql = "insert ignore into Reservation (_id, compadr) values $values on duplicate key update compadr=values(compadr)";

    $db->query($sql);
 
}
 */

$last_run_reservations_skip=0;  //reset so can run for a new client if file included again
$db->query("update Reservation set confirmedAt = checkIn where confirmedAt > checkIn"); //fix guesty bullshit
if(isset($synclogfilename)) {
    file_put_contents($synclogfilename,"-- Modified $reservationsAffected / $reservationsCount Reservations --",FILE_APPEND);
}
