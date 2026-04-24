<?php
require_once('../tools/db.php');
require_once('../tools/api_functions.php');
require_once ('../tools/Guesty.php');
require_once('../tools/Calls.php');
require_once('../tools/Firebase.php');

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Knp\Snappy\Pdf;

$api_start_time = microtime(1);
$uid = ''; //authenticated userid in this global if any specified via login token

if ($subdomain == 'qa') {
    define('GODMODE_SUBDOMAIN', 'qa');
} else {
    define('GODMODE_SUBDOMAIN', 'revestment');
}

header("Content-Type: application/json");

function validateRequest($fields) {
    foreach ($fields as $field => $rules) {
        if (!apply($_REQUEST[$field], explode('|', $rules))) {
            return false;
        };
    }
    return true;
}

function apply($value, $rules) {
    $validationRules = [
        'required' => function ($value) {
            return !is_null($value) && $value != '' && !empty($value);
        },
        'length' => function ($value, $length) {
            return strlen($value) == $length;
        },
        'min' => function ($value, $limit) {
            return floatval($value) >= $limit;
        },
        'max' => function ($value, $limit) {
            return floatval($value) <= $limit;
        }
    ];
    foreach ($rules as $rule) {
        if (strpos($rule, ':')) {
            list($rule, $arg) = explode(':', $rule);
            $result = call_user_func_array($validationRules[$rule], [$value, $arg]);
        } else {
            $result = call_user_func($validationRules[$rule], $value);
        }

        if (!$result) {
            return false;
        }
    }
    return true;
}

function API_log($response)
{
    global $db, $uid;
    if(DEBUG_MYSQL) //mixpanel being used to measure requests better now, so only log in dev/qa or when debugging is set
        $db->query('insert into APILog (method,user_id,REQUEST,RESPONSE) values (' . s($_REQUEST['method']) . ',' . ($uid ?: 'NULL') . ',' . s(json_encode($_REQUEST)) . ',' . s($response) . ')');
}

$api_time_since_last_profile = microtime(1);
function profileStep($s)
{
    global $api_time_since_last_profile;
    $currenttime = microtime(1);
    $diff = $currenttime - $api_time_since_last_profile;
    $api_time_since_last_profile = $currenttime;
    error_log("::::::  Step $s took time $diff ::::::");
}

function API_success($toReturn = [], $raw = 0)
{
    global $api_start_time;
    if (!$raw) {
        $toReturn['success'] = 1;
        $toReturn['apitime'] = microtime(1) - $api_start_time;
    }

    $toReturn = @json_encode($toReturn);
    echo $toReturn;

    API_log($toReturn);
    exit;
}

function API_fail($message)
{
    $toReturn = json_encode(["Error" => $message]);
    API_log($toReturn);
    echo $toReturn;
    exit;
}

function isAdmin()
{
    global $user;
    if ($user->role == 'admin' || $user->role == 'superadmin') return TRUE;
    return FALSE;
}

function getAdminAnalytics()
{
    global $db, $listingFilter;
    $filters = getFilters();
    $groupBy = ((isset($filters->city) && count($filters->city) == 1) || (isset($filters->tag) && count($filters->tag) == 1)) ? 'Listing.nickname' : 'address_city';
    $startDate = s($_REQUEST['start']);
    $endDate = s($_REQUEST['end'] . " 23:59:59");

    //advanced booking by checkin
    $advancedBookingByCheckin = $db->fetchAll("SELECT SUM(hostPayout-fareCleaning) as rev, count(*) as count, DATEDIFF(checkIn,confirmedAt) as numDays , $groupBy as address_city
    from Reservation
        inner join Listing on listingId=Listing._id
    where hostPayout >0 and (status = 'confirmed' OR status='canceled')
    and checkIn between $startDate and $endDate
    $listingFilter    
    GROUP BY DATEDIFF(checkIn,confirmedAt), $groupBy 
    order by address_city, numDays
    ");
    //advanced booking by confirmation
    $advancedBookingByConfirmation = $db->fetchAll("SELECT SUM(hostPayout-fareCleaning) as rev, count(*) as count, DATEDIFF(checkIn,confirmedAt) as numDays, $groupBy as address_city
    from Reservation
        inner join Listing on listingId=Listing._id
    where hostPayout >0 and (status = 'confirmed' OR status='canceled')
    and confirmedAt between $startDate and $endDate
    $listingFilter    
    GROUP BY DATEDIFF(checkIn,confirmedAt), $groupBy
    order by address_city,numDays
    ");

    $ADRvDBA = $db->fetchAll("SELECT (hostPayout-fareCleaning)/DATEDIFF(checkOut,checkIn) as adr, DATEDIFF(checkIn,confirmedAt) as dba, $groupBy as address_city
    from Reservation
        inner join Listing on listingId=Listing._id
    where hostPayout >0 and (status = 'confirmed' OR status='canceled')
    and confirmedAt between $startDate and $endDate
    $listingFilter    
    ");


    return [
        "advancedBookingByCheckin"      => $advancedBookingByCheckin,
        "advancedBookingByConfirmation" => $advancedBookingByConfirmation,
        "ADRvDBA"                       => $ADRvDBA
    ];

}

function isGodmode()
{
    global $subdomain;
    return($subdomain=="vector" || $subdomain=="stayintel");
}

function getOccupancyAnalyticsVsComparablesSql($startDate, $endDate) {
    global $listingFilter;
    $sql = "SELECT
            Listing._id,
            Listing.nickname,
            Listing.airbnb_id,
            listing_rev.rev,
            COALESCE(
                SUM(IF(ListingCalendar.reservationId <> '', ListingCalendar.price, 0)) / SUM(IF(ListingCalendar.reservationId <> '', 1, 0)),
                'n/a'
            ) AS adr,
            SUM(IF(ListingCalendar.reservationId <> '', 1, 0)) / COUNT(*) AS occ
        FROM Listing INNER JOIN ListingCalendar
            ON Listing._id = ListingCalendar.listingId
        INNER JOIN (
            SELECT Listing._id,
                SUM(
                    ((hostPayout-IF(Reservation.status='canceled',0,fareCleaning))/DATEDIFF(checkOut,checkIn))*DATEDIFF(
                        IF(checkOut <= $endDate,checkOut, DATE_ADD($endDate, INTERVAL 1 DAY)),
                        IF(checkIn > $startDate, checkIn, $startDate)
                    )
                )  AS rev
            FROM Reservation INNER JOIN Listing ON Listing._id = Reservation.listingId
            WHERE (
                (checkIn BETWEEN $startDate AND $endDate) OR
                (checkOut BETWEEN DATE_ADD($startDate, INTERVAL 1 DAY) AND $endDate) OR
                (checkIn < $startDate AND checkOut > $endDate)
            ) AND (Reservation.status IN ('confirmed','canceled'))
            GROUP BY Listing._id
            ) listing_rev ON listing_rev._id = Listing._id
        WHERE ListingCalendar.date BETWEEN $startDate AND $endDate
            AND Listing.active = 1 AND Listing.isListed = 1
            $listingFilter
        GROUP BY Listing._id";

    return $sql;
}

function getRevenueByChannelSql($startDate, $endDate, $ownerPortal = false, $useFilters = true) {
    global $listingFilter, $uid;
    $ownerPortalJoin = "inner join User_Listing on User_Listing._id = listingId";
    $ownerPortalCondition = "and User_Listing.user_id = $uid";
    $startDateFirstOfMonth = s(substr($_REQUEST['start'],0,7).'-01');

    $sql = "SELECT `month`, revsource, SUM(revenue) AS rev
        FROM monthlyCachedAnalytics
        INNER JOIN Listing ON Listing._id = listingId ".
        ($ownerPortal ? $ownerPortalJoin : "") . "
        WHERE  revsource != 'vacant' and
        CONCAT(monthlyCachedAnalytics.month,'-01') BETWEEN $startDateFirstOfMonth AND $endDate ".
        ($ownerPortal ? $ownerPortalCondition : ($useFilters ? $listingFilter : "")) . "
        $listingFilter
        GROUP BY revsource,`month`
        ORDER by revsource,`month`";
    return $sql;

/* old non cached way
    $sql = "SELECT DATE_FORMAT(`date`,'%Y-%m') AS month,
    SUM(IF(Reservation.status='canceled',
        hostPayout/DATEDIFF(DATE(checkOut),DATE(checkIn)),
        IF(lc1.status='booked', " . //this is to calculate the 'vacant' source revenue (how much money was on the table that didn't get booked)
    "
          (hostPayout-fareCleaning)/DATEDIFF(DATE(checkOut),DATE(checkIn)),
          IF((Listing.isListed && Listing.active) OR `date` <= Listing.lastActiveDate,
              price,
              0
          )
        )
    )) AS rev,
    IF(Reservation.status='canceled',
      'cancelled',
      IF(lc1.status='booked' && source IS NOT NULL, LOWER(source),'vacant')
    ) AS revsource
    FROM ListingCalendar lc1
    LEFT JOIN Reservation  ON lc1.listingId=Reservation.listingId AND lc1.date >= DATE(Reservation.checkIn) AND lc1.date<DATE(Reservation.checkOut) AND (
      Reservation.status='canceled'
      OR
      Reservation.status='confirmed'
    )
    INNER JOIN Listing on Listing._id = lc1.listingId " .
    ($ownerPortal ? $ownerPortalJoin : "") . "
    WHERE lc1.date BETWEEN $startDate AND $endDate ".
    ($ownerPortal ? $ownerPortalCondition : ($useFilters ? $listingFilter : "")) . "
    GROUP BY month,revsource
    ORDER by revsource,month";

    return $sql;*/
}


function deleteLogos() {
    global $subdomain;
    $uploadsDir = __DIR__ . '/images/uploads/';
    $logos = glob($uploadsDir . $subdomain . '_logo.{png,jpg,jpeg}', GLOB_BRACE);
    if (!empty($logos)) {
        array_map('unlink', $logos);
    }
}

function getAdminDashboard()
{
    profileStep("calling getAdminDashboard");
    global $db, $listingFilter, $subdomain,$groupBy,$startDateFirstOfMonth,$endDate;
    $filters = getFilters();
    $toReturn = [];

    $db->select_db(MASTER_DATABASE);
    $domain = $db->fetchOne('select id, is_owner_portal, cacheUpdatedOn from domains where name =' . s($subdomain));
    $is_owner_portal = $domain->is_owner_portal;
    $bnbTrackerUserId = $domain->id;
    $cacheUpdatedOn = $domain->cacheUpdatedOn;
    if (isGodmode()) {
        $toReturn['godmode'] = 'true';
        $toReturn['domains'] = $db->fetchAll("select * from domains");;
    }
    $db->select_db($subdomain);


    $startDate = s($_REQUEST['start']);
    $endDate = s($_REQUEST['end'] . " 23:59:59");

    /////////////  REVENUE BY CHANNEL  ///////////////
    $revenueByChannel = $db->fetchAll(getRevenueByChannelSql($startDate, $endDate));
    profileStep("finished revenueByChannel in ");
/////////////  REVENUE BY CITY  ///////////////
///
///
///
/*
    $groupBy = ((count($filters->unit) > 0) || (isset($filters->city) && count($filters->city) == 1) || (isset($filters->tag) && count($filters->tag) == 1)) ? 'Listing.nickname' : 'address_city';
    $revenueByCity = $db->fetchAll("select COALESCE(SUM((hostPayout-fareCleaning)/DATEDIFF(checkOut,checkIn)), 0) as rev,
    SUM(IF(Reservation._id is null,0,1)) as numBookings,
    monthlyCachedAnalytics.revenue as revenue,
    monthlyCachedRevPar.revpar as revpar,
    monthlyCachedRevPar.occ as occ,
    $groupBy  as address_city
    " . ($dateGroupBy ? ", $dateGroupBy as date" : '') . "
    from ListingCalendar
    left join Reservation on ListingCalendar.reservationId = Reservation._id  and ListingCalendar.date >= DATE(Reservation.checkIn) and ListingCalendar.date<DATE(Reservation.checkOut)
    inner join Listing on Listing._id = ListingCalendar.listingId  and Listing.active and Listing.isListed
    left join monthlyCachedAnalytics on Listing._id = monthlyCachedAnalytics.listingId 
                                      and DATE_FORMAT(ListingCalendar.date,'%Y-%m') = monthlyCachedAnalytics.month
    left join monthlyCachedRevPar on Listing._id = monthlyCachedRevPar.listingId
                                    and DATE_FORMAT(ListingCalendar.date,'%Y-%m') = monthlyCachedRevPar.month                                  
    where ListingCalendar.date between $startDate and $endDate
    and Reservation.status in ('confirmed', 'canceled')
    $listingFilter
    GROUP BY $groupBy
    " . ($dateGroupBy ? ",$dateGroupBy" : "") . "
    order by 
    " . ($dateGroupBy ? "$dateGroupBy," : "") . "
    $groupBy
    ");
*/

$startDateFirstOfMonth = s(substr($_REQUEST['start'],0,7).'-01');

    $groupBy = ((isset($filters->unit) && count($filters->unit) > 0) || (isset($filters->city) && count($filters->city) == 1) || (isset($filters->tag) && count($filters->tag) == 1)) ? 'Listing.nickname' : 'address_city';
    $revenueByCityArray = getRevenueByCityArray();


    profileStep("finished revenueByCity in ");
/////////////  PAYOUTS BY DAY  ///////////////
    $payoutsByDay = $db->fetchAll("SELECT SUM(hostPayout-fareCleaning) as rev, DATE(checkIn) as date, source
    from Reservation
    inner join Listing on Listing._id=Reservation.listingId $listingFilter
    where (status='confirmed' || (status='canceled' && hostPayout>0))
     and checkIn between $startDate and $endDate
    GROUP BY date,source
        order by date");
    profileStep("finished payoutsByDay in ");

    $revenueByDay = $db->fetchAll("select DATE(confirmedAt) as date, SUM(hostPayout-fareCleaning) as rev, source 
    from Reservation
    inner join Listing on Listing._id = Reservation.listingId 
      where status='confirmed'
      and Date(confirmedAt) between $startDate and $endDate 
      $listingFilter
      GROUP BY date,source
        order by date
      ");

    profileStep("finished revenueByDay in ");
    $sameMonthRevenue = $db->fetchAll("select DATE(confirmedAt) as date, SUM((hostPayout-fareCleaning)/DATEDIFF(checkOut,checkIn)) as rev 
    from ListingCalendar
    inner join Reservation on Reservation._id = ListingCalendar.reservationId
    inner join Listing on Listing._id = Reservation.listingId
      where Reservation.status='confirmed'
      and DATE_FORMAT(confirmedAt,'%Y-%m') = DATE_FORMAT(checkIn,'%Y-%m') 
      and DATE_FORMAT(confirmedAt,'%Y-%m') = DATE_FORMAT(ListingCalendar.date,'%Y-%m') 
      and date between $startDate and $endDate
      and confirmedAt between $startDate and $endDate
      and checkIn between $startDate and $endDate
      $listingFilter
      GROUP BY date
        order by date");

    profileStep("finished sameMonthRev in ");


    ///////// ANALITYCS VS COMPARABLES ////////////////////
    $occupancyAnalytics = [
        'analyticsVsComparables'  => $db->fetchAll(getOccupancyAnalyticsVsComparablesSql($startDate, $endDate)),
        'next30' => $db->fetchAll(getOccupancyAnalyticsVsComparablesSql('CURDATE()', 'DATE_ADD(CURDATE(), INTERVAL 30 DAY)'))
    ];

        profileStep("finished avgOccupancy in ");

    $todaysReservations = $db->fetchAll("select Listing.nickname, Listing.address_city, Listing.airbnb_id, Listing._id as listingId,
Reservation._id, Reservation.hostPayout, Reservation.compadr, Reservation.fareCleaning, Reservation.source, Reservation.checkIn, Reservation.checkOut
    from Reservation
    inner join Listing on Listing._id = Reservation.listingId
    left join Guest on Guest._id = Reservation.guestId
    where DATE(Reservation.confirmedAt)=CURDATE() AND 
    Reservation.status='confirmed'
    $listingFilter    
    ");
    profileStep('finished todaysReservations in ');
    /*  $rentProjection = $db->fetchAll("SELECT bedrooms, address_city, count(distinct(listingId)) as listingCount,
  SUM(IF(status='booked' or status='reserved',price,0))/(count(DISTINCT(listingId)))
     as avgMonthlyRev,
     SUM(furnitureCost+utilitiesCost+leaseCost)/COUNT(*) as avgCost,
     SUM(IF(status='booked' or status='reserved',price,0))/(count(DISTINCT(listingId)))/1.4 as costFor40Margin,
     SUM(IF(status='booked' or status='reserved',price,0))/(count(DISTINCT(listingId)))/1.3 as costFor30Margin,
     SUM(IF(status='booked' or status='reserved',price,0))/(count(DISTINCT(listingId)))/1.2 as costFor20Margin,
     SUM(IF(status='booked' or status='reserved',price,0))/(count(DISTINCT(listingId)))/1.1 as costFor10Margin
  FROM revestment.Listing
  left join ListingCalendar on ListingCalendar.listingId=Listing._id
   where Listing.active and Listing.isListed and
   date
  between DATE_SUB(CURDATE(), INTERVAL 30 DAY) and CURDATE()
   group by bedrooms, address_city order by address_city, bedrooms");
  */

    $todaysCheckins = $db->fetchAll("select CONCAT(Guest.firstName,' ',Guest.lastName) as fullName,
        IFNULL(Guest.firstName,Reservation.guestId) as firstName,
        IFNULL(Guest.lastName,'') as lastName,
        IFNULL(Guest.airbnb_url,'') as guestUrl,
        Listing._id as listingId,
        Listing.nickname,
        Listing.airbnb_id,
        Listing.address_city,
        Reservation._id,
        Reservation.hostPayout,
        Reservation.fareCleaning,
        Reservation.compadr,
        Reservation.source,
        Reservation.checkIn,
        Reservation.checkOut,
        DATE_FORMAT(Reservation.confirmedAt, '%Y-%m-%d') as confirmedAt
    from Reservation
    inner join Listing on Listing._id = Reservation.listingId
    inner join Guest on Guest._id = Reservation.guestId
    where Reservation.checkIn=CURDATE() AND Reservation.status='confirmed'
    $listingFilter    
    ");
    profileStep('finished todaysCheckins in ');

    $todaysCheckouts = $db->fetchAll("select CONCAT(Guest.firstName,' ',Guest.lastName) as fullName,
        IFNULL(Guest.firstName,Reservation.guestId) as firstName,
        IFNULL(Guest.lastName,'') as lastName,
        IFNULL(Guest.airbnb_url,'') as guestUrl,
        Listing._id as listingId,
        Listing.nickname,
        Listing.airbnb_id,
        Listing.address_city,
        Reservation._id,
        Reservation.hostPayout,
        Reservation.fareCleaning,
        Reservation.compadr,
        Reservation.source,
        Reservation.checkIn,
        Reservation.checkOut,
        DATE_FORMAT(Reservation.confirmedAt, '%Y-%m-%d') as confirmedAt
    from Reservation
    inner join Listing on Listing._id = Reservation.listingId
    inner join Guest on Guest._id = Reservation.guestId
    where Reservation.checkOut=CURDATE() AND Reservation.status='confirmed'
    $listingFilter
    ");
    profileStep('finished todaysCheckins in ');

    $unavailableDates = $db->fetchAll("select date, Listing._id, nickname, address_city from ListingCalendar
inner join Listing on Listing._id=listingId and Listing.active and Listing.isListed
WHERE ListingCalendar.status='unavailable'
and date > CURDATE() and date between $startDate and $endDate
  $listingFilter
order by date

    ");
    profileStep('finished unavailable Dates in ');


    $stats = $db->fetchOne("select
     ( select SUM(revenue)
                    FROM
                      monthlyCachedAnalytics mca
                          INNER JOIN
                      Listing ON Listing._id = mca.listingId
                  WHERE
                      mca.month = DATE_FORMAT(CURDATE(), '%Y-%m') AND
                      revsource != 'vacant'
                  $listingFilter
     )  as thisMonthsRev,

     (select 1-ifNULL((SUM(IF(ListingCalendar.status='available',1,0))/COUNT(*)),1)
       from ListingCalendar
       inner join Listing on Listing._id = ListingCalendar.listingId
       where
       date=CURDATE()
       and Listing.isListed
       $listingFilter
      ) as todaysOccupancy,

     (select SUM(hostPayout-fareCleaning)
                      from Reservation
                        left join Listing on Listing._id = Reservation.listingId
                                        where
                                        Listing._id is not null and
                      CURDATE() = DATE(canceledAt)
                      $listingFilter
                ) as cancelledRev,

      (select count(*)
                  from Reservation
                  left join Listing on Listing._id = Reservation.listingId
                  where
                  Listing._id is not null and
                  CURDATE() = DATE(canceledAt)
                  $listingFilter
            ) as cancelled,

    (select SUM(price)
                from ListingCalendar
                inner join Listing on Listing._id = ListingCalendar.listingId
                where
                CURDATE()=ListingCalendar.date
                and ListingCalendar.status='available'
                and Listing.isListed
                $listingFilter
     ) as lostRev,
    (select count(*)
      from ListingCalendar
                    inner join Listing on Listing._id = ListingCalendar.listingId
                    where
                    CURDATE()=ListingCalendar.date
                    and ListingCalendar.status='available'
                    and Listing.isListed
                    $listingFilter
         ) as numVacant,

     ( select SUM(hostPayout-fareCleaning) from
        Reservation
        inner join Listing on Listing._id = Reservation.listingId
        where Reservation.status='confirmed'
        and DATE(confirmedAt)=CURDATE()
        $listingFilter
     )  as todaysRev,

     ( select IFNULL((SUM((hostPayout-fareCleaning)/DATEDIFF(checkOut,checkIn)))/COUNT(*),0) from
        Reservation
        inner join Listing on Listing._id = Reservation.listingId
        where Reservation.status='confirmed'
        and CURDATE() between checkIn and DATE_SUB(checkOut,INTERVAL 1 day)
        $listingFilter
     )  as todaysADR,

     ( select count(*) from Reservation
     inner join Listing on Listing._id = Reservation.listingId and Listing.active and Listing.isListed
     where checkOut = CURDATE() and Reservation.status='confirmed'
     $listingFilter
     ) as todaysCheckouts
    ");
    profileStep('finished stats in ');

    $lastYearRev = $db->fetchAll("SELECT `month`, revsource, SUM(revenue) AS revenue
        FROM monthlyCachedAnalytics
        INNER JOIN Listing ON Listing._id = listingId
        WHERE  revsource != 'vacant' and 
        CONCAT(monthlyCachedAnalytics.month,'-01') between DATE_FORMAT(DATE_SUB(CURDATE(), interval 1 year),'%Y-%m-01') and CURDATE()
        $listingFilter
        GROUP BY revsource,`month`
    ");
    profileStep('finished lastYearRev in ');

    //////// REVPAR /////////
    $lastYearRevPar = $db->fetchAll(" SELECT `month`, $groupBy as label, AVG(revpar) as revPar
        FROM monthlyCachedRevPar
        INNER JOIN Listing on Listing._id = listingId
        WHERE true
        $listingFilter
        GROUP BY `month`, label
        ORDER BY label, `month`
    ");
    profileStep('finished lastYearRevPar in ');

    $unreachableListings = $db->fetchAll("SELECT _id, 'unreachable' as type, title, nickname, airbnb_id, airbnbDownAt as 'date', address_city from Listing where
    airbnbDownAt is not null and active
    ");
    $toReturn += [
        'revenueByChannel'      => $revenueByChannel,
        'revenueByCity'         => $revenueByCityArray,
        'payoutsByDay'          => $payoutsByDay,
        'todaysReservations'    => $todaysReservations,
        'todaysCheckins'        => $todaysCheckins,
        'todaysCheckouts'       => $todaysCheckouts,
        'revenueByDay'          => $revenueByDay,
        'sameMonthRevenue'      => $sameMonthRevenue,
        'unavailableDates'      => $unavailableDates,
        'is_owner_portal'       => $is_owner_portal,
        'bnbTrackerUserId'      => $bnbTrackerUserId,
        'cacheUpdatedOn'        => $cacheUpdatedOn,
        'stats'                 => $stats,
        'occupancyAnalytics'    => $occupancyAnalytics,
        'lastYearRev'           => $lastYearRev,
        'lastYearRevPar'        => $lastYearRevPar,
        'urgentAlerts'          => $unreachableListings,
    ];

    return $toReturn;
}

try {
    switch ($_REQUEST['method']) {
        case 'login':
            $u = $db->fetchOne('select user_id, username,fullname,email,currency,role,commission,token from User
                                        where username like ' . s($_REQUEST['username']) . '
                                         and  `password` = ' . s(hash('sha512', $_REQUEST['password'] . HASHSALT)));

            if (!$u) API_fail('No such user.');
            if (!$u->token) {
                $db->query('update User set token=UUID() where username=' . s($_REQUEST['username']));
                $u = $db->fetchOne('select user_id, username,fullname,email,currency,role,commission,token from User
                                        where username like ' . s($_REQUEST['username']) . '
                                         and  `password` = ' . s(hash('sha512', $_REQUEST['password'] . HASHSALT)));
            }
            // Mint a Firebase custom token so the browser can subscribe to live
            // call transcripts under the vectorsupportagent project. uid = user_id
            // so Firebase rules can gate reads/writes on the PHP-issued identity.
            $firebaseToken = Firebase::mintCustomToken($u->user_id, [
                'role'     => $u->role,
                'username' => $u->username,
            ]);
            API_success(["user" => $u, "firebaseToken" => $firebaseToken]);
        case 'loadAdmin':
            requireRole('admin');
            $users = $db->fetchAll('select User.user_id,username,fullname,commission,role,email,token from User');

            $listings = $db->fetchAll('select _id,user_id from User_Listing');
            foreach ($listings as $l) {
                foreach ($users as $k => $u) {
                    if ($u->user_id == $l->user_id) {
                        if (!isset($users[$k]->listings)) $users[$k]->listings = [];
                        $users[$k]->listings[] = $l->_id;
                    }
                }
            }

            $user_array = [];
            foreach ($users as $u) {
                $user_array[$u->user_id] = $u;
            }

            $listings = $db->fetchAll('select Listing._id as _id,nickname,airbnbDownAt,title,isListed,active,basePrice,cleaningFee,address_full, address_lat, address_lng, accommodates, bedrooms, address_state, roomType,
                address_city,airbnb_id,rentalsUnited_id,homeaway_id, leaseCost, furnitureCost, utilitiesCost, leaseStartDate, tags, tagsLocal, picture              
                from Listing
                left join User_Listing on User_Listing._id = Listing._id and User_Listing.user_id='.$uid
            );
            $listing_array = [];
            foreach ($listings as $l) {
                $listing_array[$l->_id] = $l;
            }

            $inactiveListings = $db->fetchAll('select Listing._id,nickname,title,Listing.active,isListed,basePrice,cleaningFee,address_full,  address_lat, address_lng, bedrooms, address_state, roomType,
                address_city,airbnb_id,rentalsUnited_id,homeaway_id, leaseCost, furnitureCost, utilitiesCost, leaseStartDate, tags, tagsLocal, picture                
                from Listing
                left join User_Listing on User_Listing._id = Listing._id and User_Listing.user_id='.$uid.'
                where 
                0=Listing.active or 0=Listing.isListed
            ');
            $inactiveListings_array = [];
            foreach ($inactiveListings as $l) {
                $inactiveListings_array[$l->_id] = $l;
            }

            $cities = $db->fetchAll('select DISTINCT(address_city) as name from Listing where Listing.active and Listing.isListed order by name asc');

            $adminDashboard = getAdminDashboard();
            $integrations = $db->fetchAll('select * from Integration');
            $imagesDir = 'images/uploads/';
            $logoPath = $imagesDir . $subdomain . '_logo';
            $array = glob($logoPath . '.{png,jpg,jpeg}', GLOB_BRACE);
            $customLogo = end($array);
            API_success([
                'users'            => $user_array,
                'listings'         => $listing_array,
                'inactiveListings' => $inactiveListings_array,
                'cities'           => $cities,
                'integrations'     => $integrations,
                'adminDashboard'   => $adminDashboard,
                'customLogo'       => $customLogo
            ]);
        case 'getAdminDashboard':
            requireRole('admin');
            API_success(getAdminDashboard());
        case 'getAdminAnalytics':
            requireRole('admin');
            API_success(getAdminAnalytics());
        case 'loadUser':
            API_success(loadUser());
        case 'addListingToUser':
            requireRole('admin');
            $lid = s($_REQUEST['listingId']);
            if(!$db->fetchValue("select _id from Listing where _id=$lid")) {
                API_fail("No listing with this id.");
            }
            $db->query("insert into User_Listing (_id,user_id) values ( $lid , $uid)");
            $listing = $db->fetchOne("select * from Listing where _id=".$lid);
            API_success(["listing"=>$listing]);
        case 'removeListingFromUser':
            requireRole('admin');
            $lid = s($_REQUEST['listingId']);
            $db->query("delete from User_Listing where _id = $lid and user_id = $uid");
            API_success();
        case 'saveExtId':
            requireRole('admin');
            $sql = "update Reservation set spinnakerId = ".s($_REQUEST['extId'])." where _id=".s($_REQUEST['reservationId']);
            error_log($sql);
            $db->query($sql);
            API_success();
        case 'adminExportUserMonthExcel':
            requireRole('admin');
            getFilters();
            $start = s($_REQUEST['start']);
            $end = s($_REQUEST['end']);
            $chosenMonth = (new \DateTime($_REQUEST['start']))->format('F');
            //                    A  B  C  D  E  F  G  H  I  J  K  L  M  N  O  P  Q
            $columnDimensions = [20,20, 7,12,14,15,11, 9,15, 2, 5, 5, 8, 8,10,12,10];
            $reservations = getReservations($start,$end);
            $spreadsheet = new Spreadsheet();
            $sheet = $spreadsheet->getSheet(0);
            for($i=1; $i<=count($columnDimensions); $i++) {
                $sheet->getColumnDimensionByColumn($i)->setAutoSize(false);
                $sheet->getColumnDimensionByColumn($i)->setWidth($columnDimensions[$i-1]);
            }
            $sheet->setTitle($chosenMonth." Export");
            $sheet1 = new \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet($spreadsheet, 'Sheet1');
            $spreadsheet->addSheet($sheet1);
            $sheet2 = new \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet($spreadsheet, 'Sheet2');
            $spreadsheet->addSheet($sheet2);


            $totalRev = 0;
            $airbnbRev = 0;
            foreach($reservations as $r) {
                if($r->source=='airbnb2') $airbnbRev+=$r->hostPayout;
                $totalRev+=$r->hostPayout;
            }
            $j = 1;
            for($i='A'; $i<'Z'; $i++,$j++) {
                define($i, $j);
            }


            $sheet->setCellValueByColumnAndRow(A,3,"Revenue");

            $sheet->setCellValueByColumnAndRow(B,3,"=SUM(I:I)");
            $sheet->getStyle('B3')
                ->getNumberFormat()
                ->setFormatCode(PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_CURRENCY_USD_SIMPLE);

            $sheet->setCellValueByColumnAndRow(E,3,"Owner Payout");
            $sheet->setCellValueByColumnAndRow(F,3,"=B3*".(1-$user->commission));
            $sheet->getStyle('F3')
                ->getNumberFormat()
                ->setFormatCode(PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_CURRENCY_USD_SIMPLE);
            $sheet->setCellValueByColumnAndRow(N,2, "FEES");
            $sheet->setCellValueByColumnAndRow(O,2, "airbnb2");
            $sheet->setCellValueByColumnAndRow(N,6, "=SUM(M7:M1048576)");
            $sheet->setCellValueByColumnAndRow(N,7, "=SUM(M10:M1048576)=SUM(Sheet1!G2:G1080)+SUM(Sheet1!I2:I1080)");
            $sheet->setCellValueByColumnAndRow(P,2, "=SUMIF(D9:D1048575,O2,I9:I1048560)");

            $sheet->setCellValueByColumnAndRow(K,7, "Total");
            $sheet->setCellValueByColumnAndRow(K,8, "=ROUND(SUM(H10:H1048576),2)+ROUND(SUM(M10:M1048576),2)+ROUND(SUM(N10:N1048576),2)=ROUND(SUM(Sheet2!H2:H1048576),2)");
            $sheet->setCellValueByColumnAndRow(K,9, "NI");
            $sheet->setCellValueByColumnAndRow(M,9, "Fees");
            $sheet->setCellValueByColumnAndRow(N,9, "Last Month Fees");
            $sheet->getStyle('H')
                ->getNumberFormat()
                ->setFormatCode(PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_CURRENCY_USD_SIMPLE);
            $sheet->getStyle('I')
                ->getNumberFormat()
                ->setFormatCode(PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_CURRENCY_USD_SIMPLE);

            $updateSheetTotals = function() {
                global $sheet,$i,$j,$user;
                $sheet->setCellValueByColumnAndRow(B, $j-2, "=SUM(I" . ($j) . ":I".($i-4).")");
                $sheet->getStyle('B'.($j-2))
                    ->getNumberFormat()
                    ->setFormatCode(PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_CURRENCY_USD_SIMPLE);
                $sheet->setCellValueByColumnAndRow(F, $j-2,"=B".($j-2)."*".(1-$user->commission));
                $sheet->getStyle('F'.($j-2))
                    ->getNumberFormat()
                    ->setFormatCode(PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_CURRENCY_USD_SIMPLE);
            };

            $i=7;
            $nickname = "asdfafsdaa";
            set_time_limit(0);
            $j=0;

            foreach($reservations as $r)
            {
                if($nickname!=$r->nickname) {
                    $i+=2;
                    $nickname = $r->nickname;
                    $sheet->setCellValueByColumnAndRow(A,$i,"Unit:");
                    $sheet->setCellValueByColumnAndRow(B,$i,$r->nickname);
                    $i++;
                    $sheet->setCellValueByColumnAndRow(A, $i, "$chosenMonth Revenue");
                    $sheet->setCellValueByColumnAndRow(E, $i,"Owner Payout:");
                    if($j!=0) {
                        $updateSheetTotals();
                    }
                    $i++;
                    $sheet->setCellValueByColumnAndRow(A,$i,"Name");
                    $sheet->setCellValueByColumnAndRow(B,$i,"Date Confirmed");
                    $sheet->setCellValueByColumnAndRow(C,$i,"Guests");
                    $sheet->setCellValueByColumnAndRow(D,$i,"Source");
                    $sheet->setCellValueByColumnAndRow(E,$i,"Status");
                    $sheet->setCellValueByColumnAndRow(F,$i,"Check In");
                    $sheet->setCellValueByColumnAndRow(G,$i,"Check Out");
                    $sheet->setCellValueByColumnAndRow(H,$i,"Revenue");
                    $sheet->setCellValueByColumnAndRow(I,$i,"$chosenMonth Revenue");

                    $i++;
                    $j = $i;
                }

                $sheet->setCellValueByColumnAndRow(A,$i,$r->firstName." ". $r->lastName);
                $sheet->setCellValueByColumnAndRow(B,$i,$r->confirmedAt);
                $sheet->setCellValueByColumnAndRow(C,$i,$r->guestsCount);
                $sheet->setCellValueByColumnAndRow(D,$i,$r->source);
                $sheet->setCellValueByColumnAndRow(E,$i,$r->status);
                $sheet->getStyle('F'.$i)
                    ->getNumberFormat()
                    ->setFormatCode(\PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_DATE_YYYYMMDDSLASH);

                $sheet->getStyle('G'.$i)
                    ->getNumberFormat()
                    ->setFormatCode(\PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_DATE_YYYYMMDDSLASH);

                $sheet->setCellValueByColumnAndRow(F,$i,excelDate($r->checkIn));
                $sheet->setCellValueByColumnAndRow(G,$i,excelDate($r->checkOut));


                $sheet->setCellValueByColumnAndRow(H,$i,$r->hostPayout);


                $startDate = new \DateTime($r->checkIn);
                $endTimestamp = (new \DateTime($r->checkOut))->getTimestamp();
                $numDaysInMonth =0;
                $totalDays =0;
                do {
                    if($startDate->format('F')==$chosenMonth) $numDaysInMonth++;
                    $startDate->add(DateInterval::createFromDateString('1 day'));
                    $totalDays++;
                } while($startDate->getTimestamp()!=$endTimestamp);

                $sheet->setCellValueByColumnAndRow(I,$i,($r->hostPayout*$numDaysInMonth/$totalDays));
                $sheet->setCellValueByColumnAndRow(K,$i,'=LOOKUP(3,1/(Sheet2!$E$2:$E$3798=A'.$i.')/(TEXT(Sheet2!$A$2:$A$3798,"dd/mm/yyyy")=TEXT(F'.$i.',"dd/mm/yyyy"))/(TEXT(Sheet2!$B$2:$B$3798,"dd/mm/yyyy")=TEXT(G'.$i.',"dd/mm/yyyy")),(Sheet2!$H$2:$H$3798))');
                $sheet->setCellValueByColumnAndRow(L,$i,"=ROUND(H$i,2)=ROUND(K$i,2)-M$i-N$i");
                $sheet->setCellValueByColumnAndRow(M,$i,'='.'LOOKUP(3,1/(Sheet1!$E$2:$E$3800=A'.$i.')/(TEXT(Sheet1!$B$2:$B$3800,"dd/mm/yyyy")=TEXT(F'.$i.',"dd/mm/yyyy"))/(TEXT(Sheet1!$C$2:$C$3800,"dd/mm/yyyy")=TEXT(G'.$i.',"dd/mm/yyyy")),(Sheet1!$G$2:$G$3800))+LOOKUP(3,1/(Sheet1!$E$2:$E$3800=A'.$i.')/(TEXT(Sheet1!$B$2:$B$3800,"dd/mm/yyyy")=TEXT(F'.$i.',"dd/mm/yyyy"))/(TEXT(Sheet1!$C$2:$C$380,"dd/mm/yyyy")=TEXT(G'.$i.',"dd/mm/yyyy")),(Sheet1!$I$2:$I$380))');
                echo "     \n\n\n\n     ";
                //$sheet->setCellValueByColumnAndRow(10,$i,'LOOKUP(3,1/(Sheet2!$E$2:$E$3798=A'.$i.')/(Sheet2!$A$2:$A$3798=F'.$i.')/(Sheet2!$B$2:$B$3798=G'.$i.'),(Sheet2!$H$2:$H$3798))');
                $i++;
            }
            if($j!=0) {
                $i += 3;
                $updateSheetTotals();
            }


            $curdate = new \DateTime();
            $filename = ucfirst($subdomain);
            $filename .= "_{$chosenMonth}_Statement_{$curdate->format('Y-m-d-hi')}.xlsx";
            $writer = new Xlsx($spreadsheet);
            $hash = md5($subdomain . $uid);
            $xlsxPath = "pdf/{$hash}.xlsx";
            $writer->setPreCalculateFormulas(false);
            $writer->save($xlsxPath);
            API_success(['path' => $xlsxPath, 'filename' => $filename]);
        case 'getPdf':
            requireRole('user');
            $start = s($_REQUEST['start']);
            $end = s($_REQUEST['end']);
            $reservations = $db->fetchAll("SELECT
                Reservation.checkIn, 
                Reservation.checkOut, 
                Reservation.hostPayout, 
                Reservation.fareCleaning, 
                Listing.nickname, 
                IFNULL(Guest.firstName,Reservation.guestId) as firstName,
                IFNULL(Guest.lastName,'') as lastName 
                FROM Reservation 
                INNER JOIN Listing ON listingId=Listing._id
                INNER JOIN User_Listing ON User_Listing.user_id = $uid AND User_Listing._id = Listing._id
                LEFT JOIN Guest ON Guest._id = Reservation.guestId
                WHERE 
                    (Reservation.status='confirmed' OR (Reservation.status='canceled' and hostPayout>0))
                    AND
                    (checkIn BETWEEN $start AND $end OR
                    checkOut BETWEEN DATE_ADD($start, INTERVAL 1 DAY) AND DATE_ADD($end, INTERVAL 1 DAY) OR 
                    $start BETWEEN checkIn AND DATE_SUB(checkOut, INTERVAL 1 DAY)
                    )
                ORDER BY Listing.nickname,Reservation.checkIn");
            $startLimit = trim($start, "'");
            $endLimit = trim($end, "'");
            $user = $db->fetchOne("select commission from User where user_id = $uid");
            $commission = floatval($user->commission);
            $imagesDir = __DIR__ . '/images/';
            $logoPath = $imagesDir . 'uploads/' . $subdomain . '_logo';
            $logo = glob($logoPath . '.{png,jpg,jpeg}', GLOB_BRACE);
            $logo = empty($logo) ? $imagesDir . 'stayintellogo.png' : end($logo);
            $bootstrapPath = __DIR__ . '/assets/css/bootstrap.min.css';
            $snappy = new Pdf('../vendor/h4cc/wkhtmltopdf-amd64/bin/wkhtmltopdf-amd64');

            ob_start();
            include 'template.php';
            $html = ob_get_clean();
            flush();
            $hash = md5($subdomain . $uid);
            $pdfPath = "pdf/{$hash}.pdf";
            $snappy->generateFromHtml($html, $pdfPath, [], true);
            $pdfUrl = $_SERVER['HTTP_REFERER'] . $pdfPath;
            $curdate = new \DateTime();
            $chosenMonth = (new \DateTime($startLimit))->format('F');
            $filename = ucfirst($subdomain);
            $filename .= "_{$chosenMonth}_Statement_{$curdate->format('Y-m-d-hi')}.pdf";

            API_success(['path' => $pdfUrl, 'filename' => $filename]);

            break;
        case 'deactivateListing':
            requireRole('admin');
            $db->query("update Listing set active=0 where airbnb_id=".s($_REQUEST['airbnb_id']));
            API_success();
            break;
        case 'recheckListing':
            requireRole('admin');
            $db->query("update Listing set airbnbDownAt = NULL where airbnb_id=".s($_REQUEST['airbnb_id']));
            API_success();
            break;
        case 'blockDates':
            requireRole('user');
            if($_REQUEST['start']=="" || $_REQUEST['end']=="" || $_REQUEST['listingId']=="") {
                API_fail("missing params");
            }
            if($uid==81) {
                file_put_contents("kingscreeklog.txt"," block request for ".$_REQUEST['listingId']."   " . $_REQUEST['start']." - ".$_REQUEST['end'],FILE_APPEND);
                $listing = $db->fetchOne('select _id from Listing inner join User_Listing using(_id) where user_id='.$uid.' AND address_apt='.s($_REQUEST['listingId']));
                if(!$listing) {
                    API_fail('no listing found');
                }
                BlockDates($listing->_id,$_REQUEST['start'], $_REQUEST['end']);
            }
            API_success();
            break;
        case 'unblockDates':
            requireRole('user');
            if($_REQUEST['start']=="" || $_REQUEST['end']=="" || $_REQUEST['listingId']=="") {
                API_fail("missing params");
            }
            if($uid==81) {
                $listing = $db->fetchOne('select _id from Listing inner join User_Listing using(_id) where user_id='.$uid.' AND address_apt='.s($_REQUEST['listingId']));
                if(!$listing) {
                    API_fail('no listing found');
                }
                UnblockDates($listing->_id,$_REQUEST['start'], $_REQUEST['end']);
            }
            API_success();
            break;
        case 'getReservationData':
            requireRole('user');
            $start = s($_REQUEST['start']);
            $end = s($_REQUEST['end']);


            $filters = getFilters();

            if (!isAdmin()) {
                $userFilterJoin = ' inner join User_Listing on User_Listing.user_id = ' . $uid . ' and User_Listing._id=Listing._id ';
                $confirmationsAlso = '';
            }
            if ($_REQUEST['mode'] == 'admin') {
                $confirmationsAlso = " or CAST(confirmedAt as DATE) between $start and $end ";
            }

    ///////// CANCELED RESERVATIONS ////////////////////
    $cancelledReservations = $db->fetchAll("select Listing.nickname, Listing.address_city, Listing.airbnb_id, Listing._id as listingId,
    Reservation._id, Reservation.hostPayout, Reservation.fareAccommodation, Reservation.fareCleaning, Reservation.checkIn, Reservation.checkOut,
    Reservation.source, Reservation.canceledAt, Reservation.confirmedAt, Reservation.canceledBy, Reservation.spinnakerId
        from Reservation
        inner join Listing on Listing._id = Reservation.listingId
        where Reservation.status='canceled'
        and Reservation.canceledAt between $start and $end
        $listingFilter
        order by Reservation.canceledAt
        ");
            $reservations = getReservations($start,$end,$confirmationsAlso,$userFilterJoin);
            API_success(["reservations" => $reservations, "cancelledReservations"=> $cancelledReservations]);
            break;
        case 'saveLogo':
            $allowedMimeTypes = array('image/png', 'image/jpeg');
            if (!in_array($_FILES['logo']['type'], $allowedMimeTypes)) {
                API_fail('The file type is not supported');
                break;
            }

            $tempName = $_FILES['logo']['tmp_name'];
            $fileOriginalName = $_FILES['logo']['name'];
            $type = end(explode('.', $fileOriginalName));

            $uploadsDir = __DIR__ . '/images/uploads/';
            $logoPath = $uploadsDir . $subdomain . '_logo';

            deleteLogos();

            if (move_uploaded_file($tempName, $logoPath . '.' . $type)) {
                API_success(['msg' => 'Logo uploaded correctly']);
            } else {
                API_success(['msg' => 'An error has ocurred while uploading the file']);
            };
            break;
        case 'refreshCache':
            include('../crons/nightlyCacheGeneration.php');
            API_success();
            break;
        case 'deleteLogo':
            deleteLogos();
            API_success(['msg' => 'The logo has been deleted, you will see the changes after refreshing the page']);
            break;
        case 'addNewIntegration':
            requireRole('admin');

            $db->query("insert into Integration (type,username,password) values (" . s($_REQUEST['integrationType']) . "," . s($_REQUEST['integrationKey']) . "," . s($_REQUEST['integrationSecret']) . ")");
            $integrations = $db->fetchAll("select * from Integration");

            API_success(["integrations" => $integrations]);
            break;
        case 'deleteIntegration':
            requireRole('admin');
            $db->query("delete from Integration where _id=" . i($_REQUEST['integrationId']));
            $integrations = $db->fetchAll("select * from Integration");

            API_success(["integrations" => $integrations]);
            break;
        case 'getListingCalendar':
            //requireRole(array('user','admin'));
            $calendarEvents = $db->fetchAll("select date as start,date as end, IF(reservationId ='', price,'') as title from ListingCalendar
                                                    left join Reservation on Reservation._id = ListingCalendar.reservationId 
                                                where 
                                                (Reservation.status='confirmed' OR Reservation.status is null) and
                                                ListingCalendar.listingId = " . s($_REQUEST['listingId']) . " and
                                                date between " . s($_REQUEST['start']) . " and " . s($_REQUEST['end']));
            API_success($calendarEvents, 1);

            break;
        case 'getListingReservations':
            //requireRole(array('user','admin'));
            $calendarEvents = $db->fetchAll("select checkIn as start,checkOut as `end`, CONCAT(firstName,' ',lastName) as title from Reservation
                                          left join Guest on Guest._id=guestId 
                                                where 
                                                Reservation.status='confirmed' and
                                                listingId = " . s($_REQUEST['listingId']) . " and
                                                ((checkIn between " . s($_REQUEST['start']) . " and " . s($_REQUEST['end']) . "
                                                    or checkOut between " . s($_REQUEST['start']) . " and " . s($_REQUEST['end']) . ")
                                                or (checkIn <= " . s($_REQUEST['start']) . " and checkOut >= " . s($_REQUEST['end']) . '))');
            API_success($calendarEvents, 1);

            break;
        case 'getReservationReviewsForListing':
            $listingId = s($_REQUEST['listingId']);
            $reviews = $db->fetchAll("SELECT
                                        rr.overall AS Overall,
                                        rr.accuracy AS Accuracy,
                                        rr.cleanliness AS Cleanliness,
                                        rr.communication AS Communication,
                                        rr.checkIn AS 'Check-In',
                                        rr.location AS Location,
                                        rr.value AS Value,
                                        r.checkOut AS dateCriteria
                                        FROM Reservation_Review rr
                                        INNER JOIN Reservation r ON r._id = rr.reservationId
                                        WHERE r.listingId = {$listingId}
                                        AND r.checkOut > DATE_SUB(NOW(), INTERVAL 3 MONTH)
                                        ORDER BY r.checkOut ASC
            ");
            API_success(['reviews' => $reviews]);
            break;
        case 'getListingReviews':
            $listingId = s($_REQUEST['listingId']);
            $reviews = $db->fetchAll("SELECT
                                        overall AS Overall,
                                        accuracy AS Accuracy,
                                        cleanliness AS Cleanliness,
                                        communication AS Communication,
                                        checkIn AS 'Check-In',
                                        location AS Location,
                                        value AS Value,
                                        createdAt AS dateCriteria
                                        FROM Review
                                        WHERE listingId = {$listingId}
                                        AND createdAt BETWEEN DATE_SUB(NOW(), INTERVAL 3 MONTH) AND NOW()
                                        ORDER BY createdAt ASC
            ");
            API_success(['reviews' => $reviews]);
            break;
        case 'getReviewsData':
            $filters = getFilters();
            $startDateFilter = s($_REQUEST['start']);
            $endDateFilter = s($_REQUEST['end']);
            $reviews = $db->fetchAll("SELECT
                                        r.listingId,
                                        Listing.nickname,
                                        r.totalReviews,
                                        ROUND(r.fiveStarsRatio * 100, 0) AS fiveStarsPercentage,
                                        r.overall,
                                        r.accuracy,
                                        r.cleanliness,
                                        r.communication,
                                        r.checkIn,
                                        r.location,
                                        r.value,
                                        r.createdAt
                                    FROM `Review` r
                                    INNER JOIN (
                                        SELECT listingId, MAX(createdAt) AS createdAt
                                        FROM `Review`
                                        GROUP BY listingId
                                    ) latests ON r.listingId = latests.listingId and r.createdAt = latests.createdAt
                                    INNER JOIN Listing
                                    ON r.listingId = Listing._id
                                    {$listingFilter}
                                    WHERE r.createdAt BETWEEN {$startDateFilter} AND {$endDateFilter}
                                    ORDER BY r.createdAt DESC
            ");

            $parsedReviews = array_map(function ($review) {
                return [
                    'editable' => [
                        'totalReviews' => $review->totalReviews,
                        'fiveStarsPercentage' => $review->fiveStarsPercentage,
                        'overall' => $review->overall,
                        'accuracy' => $review->accuracy,
                        'cleanliness' => $review->cleanliness,
                        'communication' => $review->communication,
                        'checkIn' => $review->checkIn,
                        'location' => $review->location,
                        'value' => $review->value
                    ],
                    'fixed' => [
                        'listingId' => $review->listingId,
                        'nickname' => $review->nickname,
                        'createdAt' => $review->createdAt
                    ]
                ];
            }, $reviews);

            $reservationReviews = $db->fetchAll("SELECT
                                                    rr._id,
                                                    Listing.nickname,
                                                    CONCAT(IFNULL(g.firstName, r.guestId), ' ', IFNULL(g.lastName, '') ) AS guestName,
                                                    r.checkIn,
                                                    r.checkOut,
                                                    rr.overall as starsOverall,
                                                    rr.accuracy as starsAccuracy,
                                                    rr.cleanliness as starsCleanliness,
                                                    rr.communication as starsCommunication,
                                                    rr.checkIn as starsCheckIn,
                                                    rr.location as starsLocation,
                                                    rr.value as starsValue,
                                                    rr.feedbackPublic,
                                                    rr.feedbackPrivate,
                                                    rr.feedbackAccuracy,
                                                    rr.feedbackCleanliness,
                                                    rr.feedbackCommunication,
                                                    rr.feedbackCheckIn,
                                                    rr.feedbackLocation,
                                                    rr.feedbackValue
                                                FROM Reservation_Review rr
                                                INNER JOIN Reservation r ON rr.reservationId = r._id
                                                LEFT JOIN Guest g ON r.guestId = g._id
                                                INNER JOIN Listing ON r.listingId = Listing._id
                                                {$listingFilter}
                                                WHERE r.checkOut BETWEEN {$startDateFilter} AND {$endDateFilter}
                                                ORDER BY rr.createdAt DESC
            ");

           $parsedReservationReviews = array_map(function ($review) {
               return [
                   '_id' => $review->_id,
                   'nickname' => $review->nickname,
                   'guestName' => $review->guestName,
                   'checkInDate' => $review->checkIn,
                   'checkOutDate' => $review->checkOut,
                   'feedbackPublic' => $review->feedbackPublic,
                   'feedbackPrivate' => $review->feedbackPrivate,
                   'starsOverall' => $review->starsOverall,
                   'accuracy' => [
                       'stars' => $review->starsAccuracy,
                       'feedback' => $review->feedbackAccuracy
                   ],
                   'cleanliness' => [
                       'stars' => $review->starsCleanliness,
                       'feedback' => $review->feedbackCleanliness
                   ],
                   'communication' => [
                       'stars' => $review->starsCommunication,
                       'feedback' => $review->feedbackCommunication
                   ],
                   'checkIn' => [
                       'stars' => $review->starsCheckIn,
                       'feedback' => $review->feedbackCheckIn
                   ],
                   'location' => [
                       'stars' => $review->starsLocation,
                       'feedback' => $review->feedbackLocation
                   ],
                   'value' => [
                        'stars' => $review->starsValue,
                        'feedback' => $review->feedbackValue
                    ]
                ];
            }, $reservationReviews);


           $reviewAveragesByMonth = $db->fetchAll("SELECT
 DATE_FORMAT(r.checkOut,'%Y-%m') as `label`,
 AVG(overall) as `overall`,
 AVG(accuracy) as `accuracy`,
 AVG(cleanliness) as `cleanliness`,
 AVG(communication) as `communication`,
 AVG(rr.checkIn) as `checkIn`,
 AVG(location) as `location`,
 AVG(`value`) as `value`
  FROM Reservation r
INNER JOIN Reservation_Review rr ON rr.reservationId = r._id
INNER JOIN Listing ON r.listingId = Listing._id
{$listingFilter}
WHERE r.checkOut BETWEEN DATE_FORMAT(DATE_SUB(CURDATE(), interval 1 year),'%Y-%m-01') and CURDATE()
group by `label`
order by `label`
");

            profileStep("finished getReviewsData in ");

            API_success(['reviews' => $parsedReviews,
                         'reservationReviews' => $parsedReservationReviews,
                         'reviewAveragesByMonth' => $reviewAveragesByMonth
            ]);
            break;
        case 'saveReservationReview':

            $validFields = validateRequest([
                'reservationId' => 'required|length:24',
                'overall' => 'required|min:1|max:5',
                'accuracy' => 'required|min:1|max:5',
                'cleanliness' => 'required|min:1|max:5',
                'communication' => 'required|min:1|max:5',
                'checkIn' => 'required|min:1|max:5',
                'location' => 'required|min:1|max:5',
                'value' => 'required|min:1|max:5',
                'feedbackPublic' => 'required',
                'feedbackPrivate' => 'required',
                'feedbackAccuracy' => 'required',
                'feedbackCleanliness' => 'required',
                'feedbackCommunication' => 'required',
                'feedbackCheckIn' => 'required',
                'feedbackLocation' => 'required',
                'feedbackValue' => 'required'
            ]);

            if (!$validFields) {
                API_success(['errors' => true]);
                break;
            }
            $values = [
                s($_REQUEST['reservationId']),
                i($_REQUEST['overall']),
                i($_REQUEST['accuracy']),
                i($_REQUEST['cleanliness']),
                i($_REQUEST['communication']),
                i($_REQUEST['checkIn']),
                i($_REQUEST['location']),
                i($_REQUEST['value']),
                s($_REQUEST['feedbackPublic']),
                s($_REQUEST['feedbackPrivate']),
                s($_REQUEST['feedbackAccuracy']),
                s($_REQUEST['feedbackCleanliness']),
                s($_REQUEST['feedbackCommunication']),
                s($_REQUEST['feedbackCheckIn']),
                s($_REQUEST['feedbackLocation']),
                s($_REQUEST['feedbackValue']),
                'NOW()'
            ];

            $values = implode(',', $values);

            $insertSql = "INSERT INTO `Reservation_Review` (
                `reservationId`,
                `overall`,
                `accuracy`,
                `cleanliness`,
                `communication`,
                `checkIn`,
                `location`,
                `value`,
                `feedbackPublic`,
                `feedbackPrivate`,
                `feedbackAccuracy`,
                `feedbackCleanliness`,
                `feedbackCommunication`,
                `feedbackCheckIn`,
                `feedbackLocation`,
                `feedbackValue`,
                `createdAt`
                ) VALUES ({$values})";

            $db->query($insertSql);

            API_success(['saved']);
            break;
        case 'deleteReservationReview':
            $reviewId = s($_REQUEST['reviewId']);
            $db->query("DELETE FROM Reservation_Review WHERE `_id` = {$reviewId}");
            API_success(['Review Deleted']);
            break;
        case 'saveReview':
            $validFields = validateRequest([
                'listingId' => 'required|length:24',
                'totalReviews' => 'required|min:1',
                'fiveStarsPercentage' => 'required|min:1|max:100',
                'overall' => 'required|min:1|max:5',
                'accuracy' => 'required|min:1|max:5',
                'cleanliness' => 'required|min:1|max:5',
                'communication' => 'required|min:1|max:5',
                'checkIn' => 'required|min:1|max:5',
                'location' => 'required|min:1|max:5',
                'value' => 'required|min:1|max:5'
            ]);

            if (!$validFields) {
                API_success(['errors' => true]);
                break;
            }

            $values = [
                s($_REQUEST['listingId']),
                i($_REQUEST['totalReviews']),
                f($_REQUEST['fiveStarsPercentage'] / 100),
                f($_REQUEST['overall']),
                f($_REQUEST['accuracy']),
                f($_REQUEST['cleanliness']),
                f($_REQUEST['communication']),
                f($_REQUEST['checkIn']),
                f($_REQUEST['location']),
                f($_REQUEST['value']),
                'NOW()'
            ];

            $values = implode(',', $values);

            $insertSql = "INSERT INTO `Review` (
                `listingId`,
                `totalReviews`,
                `fiveStarsRatio`,
                `overall`,
                `accuracy`,
                `cleanliness`,
                `communication`,
                `checkIn`,
                `location`,
                `value`,
                `createdAt`
                ) VALUES ({$values})";

            $db->query($insertSql);

            API_success(['listingId' => $_REQUEST['listingId']]);
            break;
        case 'getHospitalityData':
            /////////////  CLEANING REVENUE  ///////////////
            $startDate = s($_REQUEST['start']);
            $endDate = s($_REQUEST['end'] . " 23:59:59");

            $filters = getFilters();

            $groupBy = (isset($filters->city) && count($filters->city) == 1) ? 'Listing.nickname' : 'address_city';

            $cleaningRevenue = $db->fetchAll("select checkout as `date`, 
                    SUM(fareCleaning) as rev, 
                    $groupBy as city
                    from Reservation 
                    inner join Listing on Listing._id = Reservation.listingId 
                     $listingFilter
                     
                    where checkout between $startDate and $endDate
                    and Reservation.status='confirmed'
                    GROUP BY checkout, $groupBy
                    order by $groupBy, checkout
            ");
            $cleaningRevenueArray = [];
            $dates = [];
            foreach ($cleaningRevenue as $cr) {
                if (!isset($cleaningRevenueArray[$cr->city])) {
                    $cleaningRevenueArray[$cr->city] = [];
                }
                $cleaningRevenueArray[$cr->city][$cr->date] = $cr->rev;
            }


            /*
             *
    $revenueByCityArray = array();
    $dates = array();

    foreach($revenueByCity as $r) {
        if(!isset($revenueByCityArray[$r->address_city])) {
            $revenueByCityArray[$r->address_city] = array();
        }

        for($i=count($revenueByCityArray[$r->address_city]); $i < count($dates); $i++) {
            $revenueByCityArray[$r->address_city][$dates[$i]]=0;
        }
        if(@$dates[count($dates)-1]!=$r->date) $dates[]=$r->date;

        $revenueByCityArray[$r->address_city][$r->date] = $r->rev;
    }
    //append the 0 for dates that cities didnt encounter in last months
    foreach($revenueByCityArray as $city => $d) {
        for($i=count($d); $i < count($dates); $i++) {
            $revenueByCityArray[$city][$dates[$i]]="0";
        }
    }
             */
            API_success(["cleaningRevenue" => $cleaningRevenueArray]);
            break;
        case 'deleteUnitGroup':
            requireRole('user');
            $listings = $db->fetchAll("SELECT Listing._id as _id,tagsLocal FROM Listing 
  INNER JOIN User_Listing ON User_Listing._id = Listing._id
WHERE
    User_Listing.user_id = $uid        
    AND tagsLocal LIKE ".s("%".$_REQUEST['tag']."%"));
            foreach($listings as $l) {
                $tags = explode(",",$l->tagsLocal);
                $index = array_search($_REQUEST['tag'], $tags);
                if($index!==FALSE) {
                    unset($tags[$index]);
                    $tags = implode(",",$tags);
                    if($tags=='') $tags="NULL";
                    else $tags = s($tags);
                    $db->query("update User_Listing set tagsLocal = $tags where user_id=$uid and _id=".s($l->_id));
                }
            }
            API_success();
        case 'saveUnitGroup':
            requireRole('user');
            foreach($_REQUEST['listings'] as $listing) {
                $_id = s($listing);
                $tagsLocal = $db->fetchValue("select tagsLocal from User_Listing where user_id = $uid and _id = $_id ");
                if($tagsLocal!="") $tagsLocal = explode(',', $tagsLocal);
                else $tagsLocal = [];
                $tagsLocal[] = $_REQUEST['newTagLocal'];
                $tagsLocal = s(implode(",", array_unique($tagsLocal)));
                $sql = "UPDATE User_Listing set tagsLocal = $tagsLocal where user_id=$uid and _id = $_id ";
                $db->query($sql);
            }
            API_success();
            break;
        case 'getOccupancyMetrics':
            requireRole('admin');

            $start = s($_REQUEST['start']);
            $end = s($_REQUEST['end']);

            $filters = getFilters();

            $occupancyStats = $db->fetchAll("select `date`, 
SUM(IF(ListingCalendar.status='available',1,0)) as numVacancies,
 SUM(IF(ListingCalendar.status='available' ,price,0)) as lostRev,
                				SUM(IF(ListingCalendar.status<>'available' && DATE(confirmedAt)=checkIn && checkIn=date,1,0)) as numSameDay,  
                				SUM(IF(ListingCalendar.status<>'available' && DATE(confirmedAt)=DATE_SUB(checkIn, INTERVAL 1 day) && checkIn=date,1,0)) as numOneDay,
                				SUM(IF(ListingCalendar.status<>'available' && DATE(confirmedAt)=DATE_SUB(checkIn, INTERVAL 2 day) && checkIn=date,1,0)) as numTwoDay,
                                count(*) 
                                -  SUM(IF(ListingCalendar.status<>'available' && DATE(confirmedAt)=checkIn && checkIn=date,1,0))
                                -  SUM(IF(ListingCalendar.status='available',1,0))
                                -  SUM(IF(ListingCalendar.status<>'available' && DATE(confirmedAt)=DATE_SUB(checkIn, INTERVAL 1 day) && checkIn=date,1,0))
                                -  SUM(IF(ListingCalendar.status<>'available' && DATE(confirmedAt)=DATE_SUB(checkIn, INTERVAL 2 day) && checkIn=date,1,0))
                                  as  numAdvancedBookings,
                                count(*) as numUnits
                FROM ListingCalendar 

                left join Reservation on Reservation._id=reservationId
                inner join Listing on ListingCalendar.listingId=Listing._id
                WHERE  
                (`date` between  $start and $end or `date`=CURDATE() )
                and ((Listing.isListed and Listing.active) OR `date` < Listing.lastActiveDate) 
                $listingFilter                
                group by `date`"
            );
            $occupancyByDate = [];
            foreach ($occupancyStats as $os) {
                $occupancyByDate[$os->date] = $os;
            }

            $occupancyLookahead = "Select  Listing.nickname, Listing.address_city, Listing._id, Listing.tags, Listing.airbnb_id, Listing.active, Listing.isListed,
    (select COALESCE(SUM(IF(reservationId<>'',1,0))/COUNT(*), 0)  from ListingCalendar where Listing._id=ListingCalendar.listingId and date between CURDATE() and DATE_ADD(CURDATE(), INTERVAL 6 DAY)) as 7day,
    (select COALESCE(SUM(IF(reservationId<>'',1,0))/COUNT(*), 0)  from ListingCalendar where Listing._id=ListingCalendar.listingId and date between CURDATE() and DATE_ADD(CURDATE(), INTERVAL 30 DAY)) as 30day,
    (select COALESCE(SUM(IF(reservationId<>'',1,0))/COUNT(*), 0)  from ListingCalendar where Listing._id=ListingCalendar.listingId and date between CURDATE() and DATE_ADD(CURDATE(), INTERVAL 60 DAY)) as 60day,
    (select COALESCE(SUM(IF(reservationId<>'',1,0))/COUNT(*), 0)  from ListingCalendar where Listing._id=ListingCalendar.listingId and date between CURDATE() and DATE_ADD(CURDATE(), INTERVAL 90 DAY)) as 90day,
    (select AVG(price) from ListingCalendar where Listing._id=ListingCalendar.listingId and date between DATE_SUB(CURDATE(),INTERVAL 30 DAY) and CURDATE() and status='available') as vacantPrice,
    (select price from ListingCalendar where Listing._id=ListingCalendar.listingId and date = CURDATE()) as tonightsPrice,
     Listing.cleaningFee,
    (select COALESCE(SUM(IF(reservationId<>'',1,0))/COUNT(*), 0)  from ListingCalendar where Listing._id=ListingCalendar.listingId and date between " . s($_REQUEST['start']) . " and " . s($_REQUEST['end']) . ") as selectedRange,
    (select COUNT(*) from ListingCalendar 
		left join Reservation on ListingCalendar.reservationId=Reservation._id and Reservation.createdAt < DATE_SUB(CURDATE(),INTERVAL 1 YEAR) where
        ListingCalendar.status='booked' and 
        Listing._id=ListingCalendar.listingId and date between DATE_SUB(CURDATE(),INTERVAL 365 DAY) and DATE_SUB(CURDATE(), INTERVAL 358 DAY)
    )/7 as 7day_specific,    
    (select COUNT(*) from ListingCalendar 
		left join Reservation on ListingCalendar.reservationId=Reservation._id and Reservation.createdAt < DATE_SUB(CURDATE(), INTERVAL 1 YEAR) where
        ListingCalendar.status='booked' and 
        Listing._id=ListingCalendar.listingId and date between DATE_SUB(CURDATE(),INTERVAL 365 DAY) and DATE_SUB(CURDATE(), INTERVAL 335 DAY)
    )/30 as 30day_specific,
    (select COUNT(*) from ListingCalendar 
		left join Reservation on ListingCalendar.reservationId=Reservation._id and Reservation.createdAt < DATE_SUB(CURDATE(),INTERVAL 1 YEAR) where
        ListingCalendar.status='booked' and 
        Listing._id=ListingCalendar.listingId and date between DATE_SUB(CURDATE(),INTERVAL 365 DAY) and DATE_SUB(CURDATE(), INTERVAL 305 DAY)
    )/60 as 60day_specific 
    from Listing 
    where 1
    $listingFilter    
    ";
            $occupancyLookahead = $db->fetchAll($occupancyLookahead);


            ///////// OCCUPANCY DATA FOR CHART ////////////////////
/*
                $occupancyData = "Select  Listing.nickname, Listing.address_city, Listing._id, Listing.tags, Listing.airbnb_id, Listing.active, Listing.isListed,
    (select AVG(price) from ListingCalendar where Listing._id=ListingCalendar.listingId and date between DATE_SUB(CURDATE(),INTERVAL 30 DAY) and CURDATE() and status='available') as vacantPrice,
    (select price from ListingCalendar where Listing._id=ListingCalendar.listingId and date = CURDATE()) as tonightsPrice,
     Listing.cleaningFee,
    (select COALESCE(SUM(IF(reservationId<>'',1,0))/COUNT(*), 0)  from ListingCalendar where Listing._id=ListingCalendar.listingId and date between " . s($_REQUEST['start']) . " and " . s($_REQUEST['end']) . ") as selectedRange
    ";
              foreach ($dates as $d) {
                   $occupancyData .= ",(select COALESCE(SUM(IF(reservationId<>'',1,0))/COUNT(*), 0)  from ListingCalendar where Listing._id=ListingCalendar.listingId and
         date between '$d-01' and LAST_DAY('$d-01')) as '$d'";
             }
    $occupancyData .= "
    from Listing 
    where 1
    $listingFilter    
    ";
    $occupancyData = $db->fetchAll($occupancyData);

   profileStep("finished occupancyData in ");
*/

            API_success(["occupancyByDate" => $occupancyByDate,
                         "occupancyLookahead" => $occupancyLookahead,
                        // "occupancyData" => $occupancyData
            ]);
            break;
        case 'updateListing':
            requireRole('admin');
            $vars = ["leaseCost", "furnitureCost", "utilitiesCost", "leaseStartDate", "leaseType", "fixedManagementFee", "percentManagementFee"];
            $updatesql = "";

            foreach ($vars as $v) {
                if (isset($_REQUEST[$v])) {
                    if ($v != 'leaseStartDate')
                        $updatesql .= $v . " = " . f($_REQUEST[$v]) . ",";
                    else $updatesql .= $v . " = '" . $_REQUEST[$v] . "',";
                }
            }
            $updatesql = rtrim($updatesql, ',');
            $db->query("update Listing set $updatesql where _id=" . s($_REQUEST['listingId']));
            API_success();
            break;
        case 'createNewSite':
            requireRole('god');

            break;
        case 'getVacanciesOn':
            requireRole('admin');
            $vu = [];
            $date = s($_REQUEST['date']);

            $vacantUnits = $db->fetchAll("select listingId from ListingCalendar
                inner join Listing on ListingCalendar.listingId = Listing._id
                where date = $date
                    and ListingCalendar.status='available'
                    and Listing.isListed = 1
                    and Listing.active = 1");
            foreach ($vacantUnits as $u) {
                $vu[] = $u->listingId;
            }

            API_success(['vacantUnitIds' => $vu]);
            break;
        case 'log':

            API_success(['ok']);
            break;
        case 'uploadLogo':
            requireRole('admin');
            move_uploaded_file($_FILES['file']['tmp_name'], $subdomain . "_logo");
            API_success(['ok']);
        case 'deleteUser':
            requireRole('admin');
            $db->query("delete from User where user_id=".s($_REQUEST['user_id']));
            API_success(['ok']);
        case 'saveUser':
            requireRole('admin');
            if (isset($_REQUEST['commission'])) {
                $db->query("insert ignore into User (user_id,commission,username,fullname,role,email" .
                    (isset($_REQUEST['password']) ? ',password' : '')
                    . ") values (" .
                    (isset($_REQUEST['user_id']) ? s($_REQUEST['user_id']) : 'DEFAULT') . ',' .
                    s($_REQUEST['commission']) . ',' .
                    s($_REQUEST['username']) . ',' .
                    s($_REQUEST['fullname']) . ',' .
                    s($_REQUEST['role']) . ',' .
                    s($_REQUEST['email']) .
                    (isset($_REQUEST['password']) ? ',' . (s(hash('sha512', $_REQUEST['password'] . HASHSALT))) : "") .
                    ')' .
                    " on duplicate key update commission=VALUES(commission),username=VALUES(username),fullname=VALUES(fullname),email=VALUES(email)" .
                    (isset($_REQUEST['password']) ? ',password=VALUES(password)' : '')
                );
            }
            $db->query("SET SESSION  group_concat_max_len = 5555555;");
            if (isset($_REQUEST['selectedUserId']) && isset($_REQUEST['listings'])) {
                $db->query("delete from User_Listing where user_id=" . s($_REQUEST['selectedUserId']));
                $sql = '';
                $listings = explode(",", $_REQUEST['listings']);
                foreach ($listings as $l) {
                    if ($sql != '') $sql .= ',';
                    if ($l == 'null') continue;
                    $sql .= '(' . s($_REQUEST['selectedUserId']) . ',' . s($l) . ')';
                }
                $sql = "insert ignore into User_Listing (user_id,_id) values " . $sql;
                $db->query($sql);

                $user = $db->fetchOne("select User.user_id,username,fullname,role,commission from User
                                                 left join User_Listing using(user_id)
                                                  where User.user_id=" . s($_REQUEST['selectedUserId']) . "
                                                 group by User.user_id,username,fullname,commission,role");

                if (!$user) API_fail('Could not retreive updated user record.');
                $listings = $db->fetchAll("select _id from User_Listing where user_id=" . $user->user_id);
                $user->listings = [];
                foreach ($listings as $l) {
                    $user->listings[] = $l->_id;
                }

                API_success(["user" => $user]);
            } else {
                $users = $db->fetchAll("select User.user_id,username,fullname,commission,role,email,token from User");
                $listings = $db->fetchAll("select _id,user_id from User_Listing");
                foreach ($listings as $l) {
                    foreach ($users as &$u) {
                        if ($u->user_id == $l->user_id) {
                            if (!isset($u->listings)) $u->listings = [];
                            $u->listings[] = $l->_id;
                        }
                    }
                }

                $user_array = [];
                foreach ($users as $u) {
                    $user_array[$u->user_id] = $u;
                }
                API_success(['users' => $user_array]);
            }
        case 'deleteDomain':
            if (!isGodmode()) API_fail('Incorrect domain or user privileges.');
            requireRole('superadmin');

            $db->select_db(MASTER_DATABASE);
            $domain = $db->fetch_object('select * from domains where id = ' . i($_REQUEST['domainId']));
            $db->query('delete from domains where id = ' . s($_REQUEST['domainId']));

            API_success(['domains' => $db->fetchAll('select * from domains')]);
        case 'saveDomain':
            if (!isGodmode()) API_fail('Incorrect domain or user privileges.');
            requireRole('superadmin');
            $db->select_db(MASTER_DATABASE);
            $sql = 'update domains set' .
                'is_owner_portal =' . i($_REQUEST['isOwnerPortal']=='true') . ',' .
                'email =' . s($_REQUEST['email']) . 'where id = '. i($_REQUEST['domainId']) ;
            $db->query($sql);
            API_success(['domains' => $db->fetchAll('select * from domains')]);
        case 'addDomain':
            if (!isGodmode()) API_fail('Incorrect domain or user privileges.');
            requireRole('superadmin');
            $db->select_db(MASTER_DATABASE);
            $sql = 'insert into domains (name, is_owner_portal, email) values ( ' .
                s($_REQUEST['name']) . ',' .
                i($_REQUEST['isOwnerPortal']=='true') . ',' .
                s($_REQUEST['email']) .
                ')';
            $db->query($sql);
            $db->query('create schema `' . $_REQUEST['name'].'`');
            $db->select_db($_REQUEST['name']);
            $s = file_get_contents('../tools/db.sql');
            $commands=explode(';',$s);
            foreach($commands as $command) {
                $db->query($command);
            }
            $db->query('insert into User (username, password, role, email) values (' .
                s($_REQUEST['username']) . ',' .
                s(hash('sha512', $_REQUEST['password'] . HASHSALT)) . ',' .
                "'superadmin'," .
                s($_REQUEST['email']) .
                ')'
            );
            $db->select_db(MASTER_DATABASE);
            API_success(['domains' => $db->fetchAll('select * from domains')]);
        case 'getPriceLabsSettings':

            $priceLabs = $db->fetchOne("SELECT username FROM Integration WHERE type = 'pricelabs'");

            if (!$priceLabs) {
                API_success(['Error'=>'There\'s no key for PriceLabs, please set it in your account\'s settings']);
                exit;
            }

            $url = 'https://api.pricelabs.co/v1/listings';

            if (isset($_REQUEST['listingId'])) {
                $url .= '/' . $_REQUEST['listingId'];
            }

            $ch = curl_init();

            $options = [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => [
                    'X-API-Key: ' . $priceLabs->username
                ]
            ];

            curl_setopt_array($ch, $options);

            $result = json_decode(curl_exec($ch), true);

            API_success($result);

        case 'setPriceLabsSettings':
            $priceLabs = $db->fetchOne("SELECT username FROM Integration WHERE type = 'pricelabs'");

            if (isset($_REQUEST['listing'])) {
                $url = 'https://api.pricelabs.co/v1/listings';

                $listing = $_REQUEST['listing'];

                $prices = ['min', 'base', 'max'];

                array_walk($listing, function (&$element, $key) use ($prices) {
                    if (in_array($key, $prices)) {
                        $element = intval($element);
                    }
                });

                $data = [
                    'listings' => [$listing]
                ];

                $ch = curl_init();

                $options = [
                    CURLOPT_URL => $url,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST => true,
                    CURLOPT_POSTFIELDS => json_encode($data),
                    CURLOPT_HTTPHEADER => [
                        'X-API-Key: ' . $priceLabs->username,
                        'Content-Type: application/json'
                    ]
                ];

                curl_setopt_array($ch, $options);

                $result = json_decode(curl_exec($ch), true);
                API_success($result);
            };
        case 'updateUsersProfile':
            $id = s($_REQUEST['id']);
            $fullname = s($_REQUEST['fullname']);
            $email = s($_REQUEST['email']);
            $currency = s(($_REQUEST['currency']));
            $password = false;
            if (isset($_REQUEST['password'])) {
                $password = s(hash('sha512', $_REQUEST['password'] . HASHSALT));
            }
            $sql = "UPDATE User SET fullname = $fullname, email = $email, currency = $currency " . ($password ? ",password = $password" : "") . " WHERE user_id = $id";

            $db->query($sql);

            $user = $db->fetchOne("SELECT user_id, username, fullname, email, currency, role, commission, token FROM User WHERE user_id = $id");

            API_success(['user' => $user]);

        // ---------------------------------------------------------------
        // Support-call portal (bland.ai voice agent)
        // ---------------------------------------------------------------
        case 'getActiveCalls':
            requireRole('support');
            $calls = $db->fetchAll(
                "SELECT c.*, tr.code AS pending_code, tr.requested_at AS transfer_requested_at,
                        tr.expires_at AS transfer_expires_at, tr.reason AS transfer_reason,
                        g.firstName AS guest_first, g.lastName AS guest_last,
                        l.nickname AS listing_nickname, l.address_city AS listing_city
                 FROM `Call` c
                 LEFT JOIN TransferRequest tr
                        ON tr.call_id = c._id AND tr.status = 'pending' AND tr.expires_at > NOW()
                 LEFT JOIN Guest g ON g._id = c.guest_id
                 LEFT JOIN Listing l ON l._id = c.listing_id
                 WHERE c.status = 'in_progress' OR (tr.code IS NOT NULL)
                 ORDER BY c.started_at DESC
                 LIMIT 100"
            );
            API_success(['calls' => $calls]);

        case 'getCallsDashboard': {
            // Aggregate view for the /#calls dashboard — live calls, recent
            // history, 30-day counts, and a listing filter. Optional filter:
            // ?listing_id=<_id> scopes every query to that listing.
            requireRole('support');
            $listingId = isset($_REQUEST['listing_id']) ? trim($_REQUEST['listing_id']) : '';
            $lf = $listingId ? (' AND c.listing_id = ' . s($listingId)) : '';

            $active = $db->fetchAll(
                "SELECT c.*, tr.code AS pending_code, tr.requested_at AS transfer_requested_at,
                        tr.expires_at AS transfer_expires_at, tr.reason AS transfer_reason,
                        g.firstName AS guest_first, g.lastName AS guest_last,
                        l.nickname AS listing_nickname, l.address_city AS listing_city
                 FROM `Call` c
                 LEFT JOIN TransferRequest tr
                        ON tr.call_id = c._id AND tr.status = 'pending' AND tr.expires_at > NOW()
                 LEFT JOIN Guest g ON g._id = c.guest_id
                 LEFT JOIN Listing l ON l._id = c.listing_id
                 WHERE (c.status = 'in_progress' OR tr.code IS NOT NULL) $lf
                 ORDER BY c.started_at DESC
                 LIMIT 100"
            );

            $recent = $db->fetchAll(
                "SELECT c._id, c.from_number, c.started_at, c.ended_at, c.status,
                        c.summary, c.transferred_to_user_id,
                        g.firstName AS guest_first, g.lastName AS guest_last,
                        l._id AS listing_id, l.nickname AS listing_nickname, l.address_city AS listing_city
                 FROM `Call` c
                 LEFT JOIN Guest g ON g._id = c.guest_id
                 LEFT JOIN Listing l ON l._id = c.listing_id
                 WHERE c.status != 'in_progress' $lf
                 ORDER BY c.started_at DESC
                 LIMIT 100"
            );

            $daily = $db->fetchAll(
                "SELECT DATE(c.started_at) AS day,
                        COUNT(*) AS n,
                        SUM(CASE WHEN c.status='transferred' THEN 1 ELSE 0 END) AS transferred
                 FROM `Call` c
                 WHERE c.started_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) $lf
                 GROUP BY DATE(c.started_at)
                 ORDER BY day ASC"
            );

            $listings = $db->fetchAll(
                "SELECT DISTINCT l._id, l.nickname, l.address_city
                 FROM Listing l
                 INNER JOIN `Call` c ON c.listing_id = l._id
                 ORDER BY l.nickname ASC"
            );

            $summary = $db->fetchOne(
                "SELECT
                    SUM(CASE WHEN DATE(c.started_at)=CURDATE() THEN 1 ELSE 0 END) AS today,
                    SUM(CASE WHEN c.started_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN 1 ELSE 0 END) AS week,
                    SUM(CASE WHEN c.status='transferred' THEN 1 ELSE 0 END) AS transferred_total,
                    COUNT(*) AS all_time
                 FROM `Call` c
                 WHERE 1=1 $lf"
            );

            API_success([
                'active'     => $active,
                'recent'     => $recent,
                'daily'      => $daily,
                'listings'   => $listings,
                'summary'    => $summary,
                'listing_id' => $listingId,
            ]);
            break;
        }

        case 'getCall': {
            requireRole('support');
            $callId = null;
            if (!empty($_REQUEST['code'])) {
                $tr = $db->fetchOne("SELECT call_id FROM TransferRequest WHERE code = " . s($_REQUEST['code']));
                if (!$tr) API_fail('Unknown transfer code.');
                $callId = $tr->call_id;
            } elseif (!empty($_REQUEST['id'])) {
                $callId = $_REQUEST['id'];
            } else {
                API_fail('Missing id or code.');
            }
            $call = $db->fetchOne("SELECT * FROM `Call` WHERE _id = " . s($callId));
            if (!$call) API_fail('Call not found.');
            $call->transcript = $call->transcript_json ? json_decode($call->transcript_json) : [];
            unset($call->transcript_json);

            $context = null;
            if ($call->from_number) {
                $context = Calls::lookupCallerContext($call->from_number);
            }
            $transfer = $db->fetchOne(
                "SELECT code, status, requested_at, expires_at, accepted_by_user_id, reason
                 FROM TransferRequest
                 WHERE call_id = " . s($callId) . "
                 ORDER BY transfer_id DESC LIMIT 1"
            );
            API_success(['call' => $call, 'context' => $context, 'transfer' => $transfer]);
            break;
        }

        case 'acceptTransfer': {
            requireRole('support');
            $code = $_REQUEST['code'] ?? '';
            if (!$code) API_fail('Missing code.');
            $tr = $db->fetchOne("SELECT * FROM TransferRequest WHERE code = " . s($code));
            if (!$tr) API_fail('Unknown transfer code.');
            if (strtotime($tr->expires_at) < time()) {
                $db->query("UPDATE TransferRequest SET status='expired' WHERE transfer_id=" . i($tr->transfer_id));
                API_fail('This transfer request has expired.');
            }
            if ($tr->status === 'accepted' && $tr->accepted_by_user_id != $uid) {
                API_fail('Another agent has already accepted this transfer.');
            }
            $db->query(
                "UPDATE TransferRequest
                 SET status = 'accepted', accepted_by_user_id = " . i($uid) . ", accepted_at = NOW()
                 WHERE transfer_id = " . i($tr->transfer_id)
            );
            API_success(['call_id' => $tr->call_id, 'code' => $code]);
            break;
        }

        case 'getListenUrl': {
            requireRole('support');
            $callId = $_REQUEST['call_id'] ?? '';
            if (!$callId) API_fail('Missing call_id.');
            $url = BlandAI::createListenSession($callId);
            if (!$url) API_fail('Could not open listen session (call may have ended).');
            API_success(['url' => $url]);
            break;
        }

        case 'takeCall': {
            requireRole('support');
            $callId = $_REQUEST['call_id'] ?? '';
            if (!$callId) API_fail('Missing call_id.');
            $me = $db->fetchOne("SELECT user_id, phone_e164 FROM User WHERE user_id = " . i($uid));
            if (!$me || !$me->phone_e164) API_fail('Set your phone_e164 on your user profile first.');
            $resp = BlandAI::warmTransfer($callId, $me->phone_e164);
            $db->query(
                "UPDATE `Call`
                 SET status = 'transferred', transferred_to_user_id = " . i($uid) . "
                 WHERE _id = " . s($callId)
            );
            API_success(['transfer' => $resp]);
            break;
        }

        case 'lookupCallerContext': {
            requireRole('support');
            $phone = $_REQUEST['phone'] ?? '';
            if (!$phone) API_fail('Missing phone.');
            API_success(['context' => Calls::lookupCallerContext($phone)]);
            break;
        }
    }

} catch (Exception $e) {
    API_fail($e->getMessage());
}
$response = "The requested method has malfunctioned or is unavailable at this time.";
API_fail($response);