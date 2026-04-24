<?php
require __DIR__.'/../tools/config.php';
require __DIR__.'/../tools/db.php';

$db->select_db("stayintel");
    $projects = $db->fetchAll("SELECT id, name FROM domains WHERE name NOT LIKE 'qa'");

    foreach($projects as  $project) {
        $p = $project->name;

        $db->select_db($p);

        $recipients = $db->fetchAll("SELECT IFNULL(fullname, username) as fullname, email FROM User WHERE email IS NOT NULL AND email != '' AND role = 'superadmin'");

        $emails = array_map(function ($user) {
            return array(
                'email' => $user->email,
                'name' => $user->fullname,
                'type' => 'to'
            );
        }, $recipients);

        $yesterdaysBookings = $db->fetchAll("SELECT UPPER(Listing.address_city) as city, SUM(Reservation.hostPayout - Reservation.fareCleaning) as rev
            FROM Reservation
            INNER JOIN Listing ON Reservation.listingId= Listing._id
            WHERE Reservation.status='confirmed' AND DATE_FORMAT(Reservation.confirmedAt, '%Y-%m-%d')=DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            GROUP BY Listing.address_city");

        $yesterdaysTotalRev = array_reduce($yesterdaysBookings, function ($total, $reservation) {
            return $total += $reservation->rev;
        }, 0);

        $yesterdaysBookings =  array_map(function ($row) {
            return array(
                'city' => $row->city,
                'amount' => '$' . (int)$row->rev
            );
        }, $yesterdaysBookings);

        $occupancyStats = $db->fetchOne("SELECT SUM(IF(ListingCalendar.status='available',1,0)) AS numVacancies,
                SUM(IF(ListingCalendar.status='available' ,price,0)) AS lostRev
            FROM ListingCalendar
            INNER JOIN Listing ON Listing._id=ListingCalendar.listingId
            WHERE `date`=CURDATE() AND ((Listing.isListed and Listing.active) OR date < Listing.lastActiveDate)
            ");

        $totalOccupancyNext30 = $db->fetchOne("SELECT SUM(IF(ListingCalendar.status='available', 1, 0))/ COUNT(*) AS total
            FROM ListingCalendar
            WHERE ListingCalendar.date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        ")->total;

        $occupancyNext30 = $db->fetchAll("SELECT UPPER(Listing.address_city) AS city, SUM(IF(reservationId<>'',1,0))/COUNT(*) AS occ
            FROM Listing
            INNER JOIN ListingCalendar ON Listing._id=ListingCalendar.listingId
            WHERE active=1 and isListed=1 AND DATE between CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            GROUP BY Listing.address_city
            ORDER BY occ DESC");

        $occupancyNext30 = array_map(function ($row, $index) {
            $green = $row->occ >= 0.5;
            return array(
                'city' => $row->city,
                'occ' => (int)($row->occ * 100),
                'green' => $green
            );
        }, $occupancyNext30, array_keys($occupancyNext30));

        $reservationsConfirmedYesterday = $db->fetchAll("SELECT Listing.nickname, Reservation._id as id,
        (hostPayout-fareCleaning)/DATEDIFF(checkOut,checkIn) as adr,
        IF(compadr > 0, (hostPayout-fareCleaning)/DATEDIFF(checkOut,checkIn) - IFNULL(compadr,0), 'n/a') as delta
        FROM Reservation
        INNER JOIN Listing ON Reservation.ListingId = Listing._id
        WHERE DATE_FORMAT(confirmedAt, '%Y-%m-%d') = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            AND Reservation.status = 'confirmed'
        ORDER BY adr DESC
        ");

        $last = count($reservationsConfirmedYesterday) - 1;
        $adrs = array();
        if ($last >= 9) {
            for ($i = 0; $i < 5; $i++) {
                $adrs[] = array(
                    'nickname' => $reservationsConfirmedYesterday[$i]->nickname,
                    'id' => $reservationsConfirmedYesterday[$i]->id,
                    'adr' => '$' . abs((int)$reservationsConfirmedYesterday[$i]->adr),
                    'sort' => $reservationsConfirmedYesterday[$i]->adr,
                    'green' => true
                );
                $adrs[] = array(
                    'nickname' => $reservationsConfirmedYesterday[$last - $i]->nickname,
                    'id' => $reservationsConfirmedYesterday[$last - $i]->id,
                    'adr' => '$' . abs((int)$reservationsConfirmedYesterday[$last - $i]->adr),
                    'sort' => $reservationsConfirmedYesterday[$last - $i]->adr,
                    'green' => false
                );
            }
        } else {
            foreach ($reservationsConfirmedYesterday as $index => $reservation) {
                $isGreen = ($index <= (int)($last/2)) ? true : false;
                $adrs[] = array(
                    'nickname' => $reservation->nickname,
                    'id' => $reservation->id,
                    'adr' => '$' . abs((int)$reservation->adr),
                    'sort' => $reservation->adr,
                    'green' => $isGreen
                );
            }
        }

        array_multisort(array_column($adrs, 'sort'), SORT_DESC, $adrs);
        $reservationsWithComps = array_filter($reservationsConfirmedYesterday, function ($reservation) {
            return $reservation->delta !=='n/a';
        });

        usort($reservationsWithComps, function ($a, $b) {
            return ($a->delta < $b->delta) ? 1 : -1;
        });

        $deltas = array();
        $amountOf = array(
            'positives' => 0,
            'negatives' => 0
        );
        if (count($reservationsWithComps) >= 10) {
            $lastDelta = count($reservationsWithComps) - 1;
            for ($j = 0;  $j < 5; $j++) {
                if ($amountOf['positives'] < 5 && $reservationsWithComps[$j]->delta > 0) {
                    $deltas[] = array(
                        'nickname' => $reservationsWithComps[$j]->nickname,
                        'id' => $reservationsWithComps[$j]->id,
                        'delta' => '$' . abs((int)$reservationsWithComps[$j]->delta),
                        'sort' => $reservationsWithComps[$j]->delta,
                        'win' => $reservationsWithComps[$j]->delta > 0 ? true : false
                    );
                $amountOf['positives']++;
                }
                if ($amountOf['negatives'] < 5 && $reservationsWithComps[$lastDelta - $j]->delta < 0) {
                    $deltas[] = array(
                        'nickname' => $reservationsWithComps[$lastDelta - $j]->nickname,
                        'id' => $reservationsWithComps[$lastDelta - $j]->id,
                        'delta' => '$' . abs((int)$reservationsWithComps[$lastDelta - $j]->delta),
                        'sort' => $reservationsWithComps[$lastDelta - $j]->delta,
                        'win' => $reservationsWithComps[$lastDelta - $j]->delta > 0 ? true : false
                    );
                $amountOf['negatives']++;
                }

            }
        } else {
            foreach ($reservationsWithComps  as $reservation) {
                $sign = $reservation->delta > 0 ? 'positives' : 'negatives';
                if ($amountOf[$sign] < 5) {
                    $deltas[] = array(
                        'nickname' => $reservation->nickname,
                        'id' => $reservation->id,
                        'delta' => '$' . abs((int)$reservation->delta),
                        'sort' => $reservation->delta,
                        'win' => $reservation->delta > 0 ? true : false
                    );
                    $amountOf[$sign]++;
                }
            }
        }
        array_multisort(array_column($deltas, 'sort'), SORT_DESC, $deltas);


    try {
        $mandrill = new Mandrill(MANDRILL_SECRET);
        $template_name = 'daily-pulse';
        $template_content = array(
            array(
                'name' => 'project',
                'content' => strtoupper($p)
            ),
            array(
                'name' => 'rev',
                'content' => '$' . ((int)$yesterdaysTotalRev)
            ),
            array(
                'name' => 'city_rows',
                'content' => $yesterdaysBookings
            ),
            array(
                'name'=>'occupancy',
                'content'=> array(
                    'vacancies' => $occupancyStats->numVacancies,
                    'lost_rev' => '$' . $occupancyStats->lostRev
                )
            ),
            array(
                'name' => 'total_occupancy_next30',
                'content' => (int)($totalOccupancyNext30 * 100)
            ),
            array(
                'name' => 'occupancy_next30',
                'content' => $occupancyNext30
            ),
            array(
                'name' => 'adrs',
                'content' => $adrs
            ),
            array(
                'name' => 'deltas',
                'content' => $deltas
            )

        );
        $message = array(
            'html' => '<p>Example HTML content</p>',
            'text' => 'HTML Email Reader Required',
            'subject' => 'VectorStays Daily Pulse',
            'from_email' => 'noreply@vectorstays.com',
            'from_name' => 'VectorStays',
            'to' => $emails,
            'important' => false,
            'track_opens' => false,
            'track_clicks' => false,
            'auto_text' => null,
            'auto_html' => false,
            'inline_css' => null,
            'url_strip_qs' => false,
            'preserve_recipients' => null,
            'view_content_link' => null,
            'tracking_domain' => null,
            'signing_domain' => null,
            'return_path_domain' => null,
            'merge' => true,
            'merge_language' => 'handlebars',
            'global_merge_vars'=> $template_content,
            'metadata' => array('website' => 'www.vectorstays.com'),
            'recipient_metadata' => array(
                array(
                    'rcpt' => 'aman@vectorstays.com',
                    'values' => array('user_id' => 123456)
                )
            )
        );
        $async = false;
        $ip_pool = 'Main Pool';
        $send_at = '2019-02-28 00:00:00';
        $result = $mandrill->messages->sendTemplate($template_name,null, $message, $async, $ip_pool, $send_at);
        print_r($result);
        /*
        Array
        (
            [0] => Array
                (
                    [email] => recipient.email@example.com
                    [status] => sent
                    [reject_reason] => hard-bounce
                    [_id] => abc123abc123abc123abc123abc123
                )

        )
        */
    } catch(Mandrill_Error $e) {
        // Mandrill errors are thrown as exceptions
        echo 'A mandrill error occurred: ' . get_class($e) . ' - ' . $e->getMessage();
        // A mandrill error occurred: Mandrill_Unknown_Subaccount - No subaccount exists with the id 'customer-123'
        throw $e;
    }
}