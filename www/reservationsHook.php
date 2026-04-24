<?php

/**
 *  Create or update a reservation when some Guesty webhook is triggered
 * 
 *  https://docs.guesty.com/#webhooks
 */

require_once (__DIR__."/../tools/db.php");

$data = json_decode(file_get_contents('php://input'), true);

$availableEvents = ['reservation.new', 'reservation.updated'];

if (array_key_exists('reservation', $data) && in_array($data['event'], $availableEvents)) {
    $r = $data['reservation'];

    // $logFile = __DIR__ . '/webhook_data.log';

    $columns = '_id,accountId,listingId,createdAt,lastUpdatedAt,confirmedAt,confirmationCode,canceledAt,canceledBy,guestsCount,';
    $columns .= 'status,fareAccommodation,fareCleaning,hostPayout,currency,guestId,checkIn,checkOut,source';

    $updateColumns='';

    $columnsarray = explode(',', $columns);

    foreach ($columnsarray as $c) {
        $updateColumns .= $c . '=VALUES(' . $c . '),';
    }

    $updateColumns = rtrim($updateColumns, ',');

    $r = $data['reservation'];

    $sql = s($r['_id']) . ',' .
        s($r['accountId']) . ',' .
        s($r['listingId']) . ',' .
        "CONVERT_TZ(".s($r['createdAt']) . ",'+00:00','$timezone')," .
        "CONVERT_TZ(".s($r['lastUpdatedAt']) . ",'+00:00','$timezone')," .
        "CONVERT_TZ(".@s($r['confirmedAt']) . ",'+00:00','$timezone')," .
        @s($r['confirmationCode']) . ',' .
        "CONVERT_TZ(".@s($r['canceledAt']) . ",'+00:00','$timezone')," .
        @s($r['canceledBy']) . ',' .
        i($r['guestsCount']) . ',' .
        s($r['status']) . ',' .
        s($r['money']['fareAccommodation']) . ',' .
        @s($r['money']['fareCleaning']) . ',' .
        s($r['money']['hostPayout']) . ',' .
        s($r['money']['currency']) . ',' .
        s($r['guestId']) . ',' .
        "CONVERT_TZ(".s($r['checkIn']) . ",'+00:00','$timezone')," .
        "CONVERT_TZ(".s($r['checkOut']) . ",'+00:00','$timezone')," .
        s($r['source']);

    $sql = "insert ignore into Reservation ($columns) values ($sql) on duplicate key update $updateColumns";

    $db->query($sql);

/*     $log = $data['event'] . PHP_EOL;
    $log .= print_r($sql, true) . PHP_EOL . PHP_EOL;

    file_put_contents($logFile, $log, FILE_APPEND); */
}