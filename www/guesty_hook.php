<?php
require_once ("../tools/db.php");
require_once ("../tools/Guesty.php");
require_once ("../tools/KingsCreekAPI.php");
require_once("../tools/SpinnakerAPI.php");

$data = json_decode(file_get_contents('php://input'));

switch($data->event) {
    case 'guest.created':
        Guesty::insertGuests([$data->guest]);
    case 'guest.updated':
        Guesty::insertGuests([$data->guest]);
    break;
    case 'listing.calendar.updated':
        $calendarentries = $data->calendar;
        $listingCalendarsAffected=Guesty::insertListingCalendars($calendarentries);
        error_log("updated $listingCalendarsAffected listing Calendars from guesty hook");
        break;

    case 'reservation.new':
        $r = $data->reservation;
        $g = new Guesty();
        $guests = $g->getGuests([$r->guest->_id]);
        Guesty::insertGuests($guests);
        $r->guest = $guests[0];
        Guesty::insertReservations([$r]);
        if($r->status=='confirmed'||$r->status=='canceled') {
            $vectorReservation = KingsCreekAPI::getVectorReservations($r->_id);
            if ($vectorReservation) {
                $kc = new KingsCreekAPI();
                $kc->createReservationFromVectorReservation($vectorReservation);
            }
        }
        error_log("Inserted new reservation from guesty hook");
    break;
    case 'reservation.updated':
        $r = $data->reservation;
        Guesty::insertReservations([$r]);
        if($r->status=='confirmed'||$r->status=='canceled') {
            $vectorReservation = KingsCreekAPI::getVectorReservations($r->_id);
            if ($vectorReservation) {
                $kc = new KingsCreekAPI();
                $kc->updateReservationFromVectorReservation($vectorReservation);
            }

            $vectorReservation = SpinnakerAPI::getVectorReservations($r->_id);

            if ($vectorReservation) SpinnakerAPI::updateReservationFromVectorReservation($vectorReservation);
        }
        error_log("Updated reservation from guesty hook");
        break;
    case 'listing.updated':
        $response = Guesty::insertListings([$data->listing]);
        error_log("updated ".$response['listingsAffected']." listings from guesty hook");
        break;
    case 'payments.failed':
    case 'reservation.messageReceived':
    case 'reservation.messageSent':
    case 'reservation.reviewed':
    case 'task.created':
    case 'task.deleted':
    case 'task.updated':
    break;
    default:
        error_log("unknown guesty hook event: ". $data->event);
}

echo "ok";
?>