<?php
/**
 * Created by IntelliJ IDEA.
 * User: seth
 * Date: 2020-01-02
 * Time: 11:42
 */

require_once __DIR__.'/../tools/config.php';
require_once __DIR__.'/../tools/db.php';
set_time_limit(0);
$db->select_db("stayintel");
$domains = $db->fetchAll('select name from domains');
if(false) //set to true for QA testing
    $domains=[(object)['name'=>'qa']];

foreach($domains as $d) {
    echo "Generating cache for " . $d->name . PHP_EOL;
    $db->select_db($d->name);
    $i=-2;
    if(date("d")=='28') {
        $i=-42;
    }
    for(; $i<=12; $i++) {
        $month = date("Y-m",strtotime("+".$i." month"));
        $from = "$month-01";
        $to   = date("Y-m-d 23:59:59",strtotime("$month +1 month -1 day"));
        echo "Generating cache from $from to $to". PHP_EOL;

        $db->query("delete from monthlyCachedAnalytics where month = '$month'");
        $db->query("delete from monthlyCachedOccupancy where month = '$month'");
        $db->query("delete from monthlyCachedRevPar where month = '$month'");
        sleep(2);

        fillMonthlyCachedAnalytics($from,$to);
        fillRevParTable($from,$to);
    }
    $db->select_db("stayintel");
    $db->query("update domains set cacheUpdatedOn=NOW() where name=".s($d->name));
}



function fillMonthlyCachedAnalytics($startDate, $endDate) {
    global $db;

    //this query takes about 5 seconds to run
    $q = "SELECT DATE_FORMAT(`date`, '%Y-%m') AS month,
            SUM(
                IF(Reservation.status = 'canceled',
                    hostPayout / DATEDIFF(DATE(checkOut), DATE(checkIn)),
                    IF(lc1.status = 'booked',
                        (hostPayout - fareCleaning) / DATEDIFF(DATE(checkOut), DATE(checkIn)),
                        IF((Listing.isListed && Listing.active)	OR `date` <= Listing.lastActiveDate,
                            price,
                            0)
                    )
                )
            ) AS revenue,
            Listing._id as listingId,
            IF(Reservation.status = 'canceled',
                'cancelled',
                IF(lc1.status = 'booked' && source IS NOT NULL,
                    LOWER(source),
                    'vacant'
                )
            ) AS `revsource` FROM
            ListingCalendar lc1
                LEFT JOIN
            Reservation ON lc1.listingId = Reservation.listingId
                AND lc1.date >= DATE(Reservation.checkIn)
                AND lc1.date < DATE(Reservation.checkOut)
                AND (Reservation.status = 'canceled'
                OR Reservation.status = 'confirmed')
                INNER JOIN
            Listing ON Listing._id = lc1.listingId
        WHERE
          
            lc1.date BETWEEN '$startDate'
                AND '$endDate'
        GROUP BY `month`, listingId, revsource
        ";
    $results = $db->fetchAll($q);
    $q = "INSERT INTO `monthlyCachedAnalytics` (`month`, `revenue`, `listingId`, `revsource`) values ";
    foreach($results as $r) {
      $q.="(".s($r->month).",".s($r->revenue).",".s($r->listingId).",".s($r->revsource)."),";
    }
    $q[strlen($q)-1]=' '; //remove last ,
    $q.="ON DUPLICATE KEY UPDATE revenue=VALUES(revenue), revsource=VALUES(revsource)";
    $db->query($q);
}

function fillRevParTable($startDate, $endDate) {
    global $db;
    //this query takes about 3 seconds to run
    $q = "SELECT DATE_FORMAT(ListingCalendar.`date`, '%Y-%m') AS `month`,
                        Listing._id AS listingId,
                        SUM(IF(reservationId<>'',1,0))/COUNT(*) AS occ,
                        SUM(IF(reservationId<>'',1,0)) AS daysBooked
                        FROM Listing
                        INNER JOIN ListingCalendar ON Listing._id = ListingCalendar.listingId
                        WHERE ListingCalendar.`date` BETWEEN '$startDate' AND '$endDate'
                        GROUP BY listingId, month";

    $result = $db->fetchAll($q);
    $q = "INSERT INTO monthlyCachedOccupancy (`month`,listingId,occ,daysBooked) values ";
    foreach($result as $r) {
        $q.="(".s($r->month).",".s($r->listingId).",".s($r->occ).",".s($r->daysBooked)."),";
    }
    $q[strlen($q)-1]=' ';
    $q.="ON DUPLICATE KEY UPDATE occ=VALUES(occ), daysBooked=VALUES(daysBooked)";
    $db->query($q);

    $insertSql = "INSERT INTO `monthlyCachedRevPar` (`month`, `listingId`, `adr`, `occ`, `revpar`)
select * from (
        SELECT m.month as month,
        m.listingId as listingId,
        IF(occ.daysBooked > 0, SUM(m.revenue)/occ.daysBooked, 0) as adr,
        occ.occ as occ,
        IF(occ.daysBooked > 0, SUM(m.revenue)/occ.daysBooked * occ.occ, 0) as revpar
        FROM monthlyCachedAnalytics m
        INNER JOIN monthlyCachedOccupancy occ ON occ.month = m.month AND occ.listingId=m.listingId
        WHERE m.revsource NOT IN ('cancelled','vacant')
        GROUP BY m.month, m.listingId
        ) temp
        ON DUPLICATE KEY UPDATE adr=temp.adr, occ=temp.occ, revpar=temp.revpar
";
    $db->query($insertSql);
}