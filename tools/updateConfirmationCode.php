<?php
require_once (__DIR__."/db.php");
require_once (__DIR__."/Guesty.php");

$db->select_db("stayintel");
$projects = $db->fetchAll("select id, name from domains");

foreach($projects as  $project) {
    $p = $project->name;
    $db->select_db($p);

    $integrations = $db->fetchAll("select * from Integration where type='guesty'");

    foreach ($integrations as $i) {
        $GUESTY_KEY = $i->username;
        $GUESTY_SECRET = $i->password;
        $g = new Guesty($GUESTY_KEY,$GUESTY_SECRET);

        $reservationsWithoutConfirmationCode = $db->fetchAll("
            select _id from Reservation
            where Reservation.confirmationCode is null
            and Reservation.status = 'confirmed' or Reservation.status = 'canceled'
            ");

        $total = count($reservationsWithoutConfirmationCode);

        if ($total > 0) {

            $reservationIds = array_map(function ($reservation) {
                return $reservation->_id;
            }, $reservationsWithoutConfirmationCode);

            $reservationsWithConfirmationCode = array();
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
                    'fields' => 'confirmationCode',
                    'filters' => array(
                        array(
                            'field' => '_id',
                            'operator' => '$in',
                            'value' => array_slice($reservationIds, $offset, $length)
                        ),
                        array(
                            'field' => 'status',
                            'operator' => '$in',
                            'value' => array('confirmed','canceled')
                        )
                    )
                );

                $reservations = $g->query("reservations", $data);

                $offset += $length;

                if(isset($reservations)) {
                    $reservationsWithConfirmationCode = array_merge($reservationsWithConfirmationCode, $reservations->results);
                }
            }

            if (!empty($reservationsWithConfirmationCode)) {
                $toUpdate = array_map(function ($reservation) {
                    return "('$reservation->_id', '$reservation->confirmationCode')";
                }, $reservationsWithConfirmationCode);
                $values = implode(',', $toUpdate);
                $sql = "insert ignore into Reservation (_id, confirmationCode)
                    values $values
                    on duplicate key update confirmationCode=values(confirmationCode)";

                $db->query($sql);
            }
        }
    }
}