<?php
chdir(__DIR__);
require_once("../tools/db.php");
require_once("../tools/api_functions.php");
require_once("../tools/KingsCreekAPI.php");
require_once("../tools/Guesty.php");

$kc = new KingsCreekAPI();
KingsCreekAPI::blockAllListingsAvailability();


/*
$vectorReservations = KingsCreekAPI::getVectorReservations();
$vectorReservationCount= count($vectorReservations);
$kcReservations = $kc->getReservations();

$kcReservationByNumber = [];
$vectorReservationByNumber = [];
foreach($kcReservations as $r) {
    echo $r->number." ". substr($r->checkIn,0,10)." ".substr($r->checkOut,0,10)." ".$r->status." ". $r->firstName." ".$r->lastName." ".implode(',',array_map(function($r) { return $r->number;},$r->rooms))."\n";
    if(isset($r->number)) {
        //search if confirmation code was set as number
        if(strlen($r->number) < 12)
        foreach($vectorReservations as $vr) {
            if($vr->confirmationCode == $r->number) {
                echo 'found confirmation code in number field, updating!';
                $r->number = $vr->number;
                $kc->updateReservation($r);
                break;
            }
        }
        if(isset($kcReservationByNumber[$r->number])) {
            if(str_replace('ll','l',strtolower($r->status))=='canceled') {
                //$r->number="";
                //$kc->updateReservation($r);
                continue;
            } else if(str_replace('ll','l',strtolower($kcReservationByNumber[$r->number]->status))=='canceled') {
                $kcReservationByNumber[$r->number] = $r;
                continue;
                //$kcReservationByNumber[$r->number]->number="";
                //$kc->updateReservation($kcReservationByNumber[$r->number]);
            } else {
                KingsCreekAPI::sendErrorMail("Found the same reservation id (number) on multiple kc reservations. Cancelling one, updating other if needed. " . printr_html($r) .
                    "<br/><br/>" . printr_html($kcReservationByNumber[$r->number]));
                $r->status='canceled';
                $kc->updateReservation($r);
                continue;
            }
        }
        $kcReservationByNumber[$r->number] = $r;
    }
    //  else {
    // echo KingsCreekAPI::sendErrorMail("Reservation found from external system (no number): ". print_r($r,1));
    //}
}
$log ="Synchronizing kings creek. $vectorReservationCount vector reservations exist, ". count($kcReservationByNumber). " in kc.";

$newReservations = [];
foreach($vectorReservations as $r) {
    $vectorReservationByNumber[$r->number] = $r;
    if(!isset($kcReservationByNumber[$r->number])) {
        $kc->createReservationFromVectorReservation($r);
    } elseif($difference = isDifferenceBetweenVectorReservationAndKCReservation($r,$kcReservationByNumber[$r->number])) {
        echo "$difference found for reservation ".$r->number." calling update.";
        $kc->updateReservationFromVectorReservation($r);
    }
}

//////////////////////////////// BLOCK CALENDAR ON UNAVAILABLE DATES /////////////////////////////
$availability = [];
$availabilityRecords = $kc->getAvailability();

$unique_rooms = $db->fetchAll("select distinct(address_apt) as room from Listing
    inner join User_Listing on User_Listing._id= Listing._id
where user_id = 81  and address_apt <> ''
");
foreach($unique_rooms as $r) {
    $availability[$r->room] = [];
}


foreach($availabilityRecords as $a) {
    if(!isset($availability[$a->roomNumber])) $availability[$a->roomNumber] = [];
    $availability[$a->roomNumber][substr($a->dateAllocated,0,10)] = 1;
}

//generate report to jesse for any rooms with no availability at all
$noavailabilityrooms = [];
foreach($availability as $room=>$a) {
    if(count($a)==0) {
        $noavailabilityrooms[]=$room;
    }
}

if(count($noavailabilityrooms)>0) {
    $result = KingsCreekAPI::sendErrorMail("There is no longer any availability for the following rooms: ".print_r($noavailabilityrooms,1));
    echo "There are some listings without any availability: ". print_r($noavailabilityrooms,1). "emailed with result ".$result;
}

//add dates from our reservations to availability, then check for missing availability to block dates
foreach($availability as $room=>$dates) {
    if(!isset($vectorReservationByNumber[$room])) continue;
    foreach ($vectorReservationByNumber[$room] as $r) {
        $date = $r->checkIn;
        do {
            if(!isset($dates[$date])) {
                KingsCreekAPI::sendErrorMail("KINGS CREEK SAYS $date IS AVAILABLE BUT WE HAVE RESERVATION: ". print_r($r,1));
            }

            $availability[$room][$date] = 1;

            $date = date('Y-m-d', strtotime($date . ' +1 day'));
        } while($date!=$r->checkOut);
    }
}
$daysMissing = [];
$twoYearsFromToday = date('Y-m-d', strtotime('today + 2 year'));
foreach($availability as $room => $dates) {
    $daysMissing[$room] = [];
    $date = date('Y-m-d', strtotime('today'));
    do {
        if(!isset($availability[$room][$date])) $daysMissing[$room][] = $date;
        $date = date('Y-m-d', strtotime($date . ' +1 day'));
    } while($date != $twoYearsFromToday);
}

foreach($daysMissing as $room => $dates) {
    $datesNeedingBlocking = $db->fetchAll("
select ListingCalendar.listingId,ListingCalendar.date from ListingCalendar 
    inner join Listing on Listing._id = ListingCalendar.listingId
    inner join User_Listing on User_Listing._id= Listing._id
where user_id = 81 
      and status = 'available'
      and date in ('".implode("','",$dates)."')
      and (
         Listing.address_apt = " . s($room) . " OR 
         Listing.address_apt like '%," . $room . "' OR 
         Listing.address_apt like '" . $room . ",%' OR
         Listing.address_apt like '%," . $room . ",%'
        )
");
    foreach($datesNeedingBlocking as $d) {
        $log.= "blocking date ".$d->date. " for $room listing $d->listingId \n";
        BlockDates($d->listingId,$d->date,$d->date);
    }
    $unavailableDates = $db->fetchAll("
    select ListingCalendar.listingId, ListingCalendar.date from ListingCalendar
    inner join Listing on Listing._id = ListingCalendar.listingId
    inner join User_Listing on User_Listing._id = Listing._id
where user_id = 81
    and status = 'unavailable'
    and (
         Listing.address_apt = " . s($room) . " OR 
         Listing.address_apt like '%," . $room . "' OR 
         Listing.address_apt like '" . $room . ",%' OR
         Listing.address_apt like '%," . $room . ",%'
        )
    ");
    foreach($unavailableDates as $d) {
        if(!in_array($d->date,$dates)) {
            $log.= "unblocking date ".$d->date;
            UnblockDates($d->listingId,$d->date,$d->date);
        }
    }
}
error_log($log);

///////////////////////////////////////////////////////////////////////////////////////////////////
function arrayDiff($A, $B) {
    $intersect = array_intersect($A, $B);
    return array_merge(array_diff($A, $intersect), array_diff($B, $intersect));
}

function isDifferenceBetweenVectorReservationAndKCReservation($vR,$kcR) {
    $roomOverride = false;
    if(count($kcR->specialNeeds)>0) {
        foreach($kcR->specialNeeds as $v) {
            if($v->needText == 'VECTORROOM') $roomOverride = true;
        }
    }
    if(isset($vR->rooms) && $vR->rooms!="" && !$roomOverride) {
        $vectorRoomArray = explode(',', $vR->rooms);
        if(!is_array($vectorRoomArray)) $vectorRoomArray = [];
        $kcRoomArray = array_map(function ($room) {
            return $room->number;
        }, $kcR->rooms);
        if(count(arrayDiff($kcRoomArray, $vectorRoomArray)) > 0) {
            return "rooms are different";
        }
    }

    if(
        (@strtolower($kcR->status)=='cancelled' && $vR->status!='canceled') ||
        (strtolower($kcR->status)=='booked' && $vR->status!='confirmed'))
        return "status is different";
    if(
        substr($kcR->checkIn,0,10) != $vR->checkIn ||
        substr($kcR->checkOut,0,10) != $vR->checkOut) return "dates are different";


    return false;
}
*/