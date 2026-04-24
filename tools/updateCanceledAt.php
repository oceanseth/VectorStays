<?php
require_once (__DIR__."/db.php");
require_once (__DIR__."/Guesty.php");

$integrations = $db->fetchAll("select * from Integration where type='guesty'");

foreach ($integrations as $i) {
    $GUESTY_KEY = $i->username;
    $GUESTY_SECRET = $i->password;
    $g = new Guesty($GUESTY_KEY,$GUESTY_SECRET);

    $reservationsWithoutCanceledAt = $db->fetchAll("
        select _id from Reservation
        where Reservation.status = 'canceled'
        and Reservation.canceledAt is null
    ");

    $total = count($reservationsWithoutCanceledAt);

    if ($total > 0) {

        $reservationIds = array_map(function ($reservation) {
            return $reservation->_id;
        }, $reservationsWithoutCanceledAt);

        $reservationsWithCanceledAt = array();
        $i = 0;
        $offset = 0;
        $length = 20;
        $cycles = floor($total / $length) + 1;

        while($i++ <= $cycles) {
            if ($i == $cycles) {
                $length = $total - ($offset + 1);
            }

            $data = array(
                'limit' => $length,
                'fields' => 'canceledAt',
                'filters' => array(
                    array(
                        'field' => '_id',
                        'operator' => '$in',
                        'value' => array_slice($reservationIds, $offset, $length)
                    ),
                    array(
                        'field' => 'status',
                        'operator' => '$in',
                        'value' => array('canceled')
                    )
                )
             );

            $reservations = $g->query("reservations", $data);

            $offset += $length;

            $reservationsWithCanceledAt = array_merge($reservationsWithCanceledAt, $reservations->results);
        }

        $toUpdate = array_map(function ($reservation) {
            return "('$reservation->_id', '$reservation->canceledAt')";
        }, $reservationsWithCanceledAt);

        $values = implode(',', $toUpdate);
        $sql = "insert ignore into Reservation (_id, canceledAt)
            values $values
            on duplicate key update canceledAt=values(canceledAt)";

        $db->query($sql);
    }
}