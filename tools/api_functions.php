<?php

function requireRole($r)
{
    global $db, $user, $uid;
    if ($user == '') $user = $db->fetchOne('select role,user_id, commission from User where token = ' . s($_REQUEST['token']));
    if ($user == '') API_fail('User token expired, please login.');
    if ($user->role == '') API_fail('Current user has no role.');
    $uid = $user->user_id;

    if (($user->role == 'admin' || $user->role == 'superadmin')) {
        if (isset($_REQUEST['selectedUserId'])) {
            $user = $db->fetchOne('select role,user_id, commission from User where user_id=' . s($_REQUEST['selectedUserId']));
            $uid = $user->user_id;
        }
        return TRUE;
    } elseif (is_array($r)) {
        if (!in_array($user->role, $r)) API_fail('Required user role not set on this account.');
    } elseif ($user->role != $r) API_fail('Required user role not set on this account.');
}
function removeLeadingZero($s) {
    if($s[0]=='0') return substr($s,1);
    return $s;
}
function excelDate($s) {

    // PHP-time (Unix time)
    $time = Datetime::createFromFormat("d/m/Y",$s);
    return \PhpOffice\PhpSpreadsheet\Shared\Date::PHPToExcel($time);
/*    $spreadsheet->getActiveSheet()
        ->setCellValue('D1', );
    $spreadsheet->getActiveSheet()->getStyle('D1')
        ->getNumberFormat()
        ->setFormatCode(\PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_DATE_YYYYMMDDSLASH);



    return removeLeadingZero(substr($s,5,2)).'/'.removeLeadingZero(substr($s,8,2)).'/'.substr($s,0,4);
*/
}
function getFilters()
{
    global $listingFilter;
    if (!isset($_REQUEST['filters'])) return new stdClass();

    $filters = json_decode($_REQUEST['filters']);

    foreach ($filters as $type => $filter) {
        $filtersql = $type . "_sql";
        foreach ($filter as $f) {
            if (!isset($filters->$filtersql)) $filters->$filtersql = s($f);
            else $filters->$filtersql .= ',' . s($f);
        }
    }

    if (isset($filters->unit)) {
        $listingFilter = "and (Listing._id in ( " . $filters->unit_sql . ")";
    } elseif (isset($filters->city)) {
        $listingFilter = "and (Listing.address_city in(" . $filters->city_sql . ")";
    } elseif (isset($filters->tag)) {
        if ($listingFilter == '') $listingFilter = "and ( false ";
        foreach ($filters->tag as $t) {
            $listingFilter .= " or (Listing.tags like '%$t,%' or Listing.tags like '%,$t%' or LOWER(Listing.tags) = LOWER('$t')) ";
        }
    } elseif (isset($filters->tagsLocal)) {
        if ($listingFilter == '') $listingFilter = 'and ( false ';
        foreach ( $filters->tagsLocal as $t) {
            $listingFilter .= " or (
            User_Listing.tagsLocal like ".s('%$t,%')." or 
            User_Listing.tagsLocal like ".s('%,$t,%')." or 
            User_Listing.tagsLocal like ".s('%,$t')." or 
            LOWER(User_Listing.tagsLocal) = LOWER('$t')
            ) ";
        }
    }

    if (isset($filters->bedroom)) {
        $listingFilter .= "and (Listing.bedrooms in ( " . $filters->bedroom_sql . "))";
    }

    if ($listingFilter != '') $listingFilter .= ")";
    return $filters;
}


function getRevenueByCityArray() {
    global $db,$groupBy,$startDateFirstOfMonth,$endDate,$listingFilter,$uid;
    $userFilter='';
    if(!isset($_REQUEST['start'])) {
        $_REQUEST['start'] = date('Y-m-d');
        $_REQUEST['end'] = date('Y-m-t');
    }
    if(!isset($startDateFirstOfMonth)) { //loading user dashboard data, or generating cache of it
        $startDateFirstOfMonthToUse = s(substr($_REQUEST['start'],0,7).'-01');
        $groupBy = 'Listing.nickname';
        $endDate = s($_REQUEST['end'] . " 23:59:59");
        $userFilter = 'inner join User_Listing on Listing._id = User_Listing._id and User_Listing.user_id='.$uid;
    } else {
        $startDateFirstOfMonthToUse = $startDateFirstOfMonth;
    }
    $revenueByCity = $db->fetchAll("select 
    SUM(monthlyCachedAnalytics.revenue) as revenue,
    AVG(monthlyCachedRevPar.revpar) as revpar,
    AVG(monthlyCachedRevPar.occ) as occ,
    AVG(monthlyCachedRevPar.adr) as adr,
    $groupBy  as address_city,
    monthlyCachedRevPar.month as date
    from Listing
    $userFilter
    inner join monthlyCachedRevPar on Listing._id = monthlyCachedRevPar.listingId
                                    and CONCAT(monthlyCachedRevPar.month,'-01') between $startDateFirstOfMonthToUse and $endDate
    left join monthlyCachedAnalytics on Listing._id = monthlyCachedAnalytics.listingId 
                                  and monthlyCachedAnalytics.month = monthlyCachedRevPar.month                                   
    where revsource != 'vacant'
    and CONCAT(monthlyCachedRevPar.month,'-01') between $startDateFirstOfMonthToUse and $endDate
    $listingFilter
    GROUP BY $groupBy ,
    monthlyCachedRevPar.month
    order by 
    monthlyCachedRevPar.month,
    $groupBy
    ");

    $revenueByCityArray = [];
    $dates = [];

    foreach ($revenueByCity as $r) {
        if (!isset($revenueByCityArray[$r->address_city])) {
            $revenueByCityArray[$r->address_city] = [];
        }

        for ($i = count($revenueByCityArray[$r->address_city]); $i < count($dates); $i++) {
            $revenueByCityArray[$r->address_city][$dates[$i]] = 0;
        }
        if (@$dates[count($dates) - 1] != $r->date) $dates[] = $r->date;

        $revenueByCityArray[$r->address_city][$r->date] = ['revenue'=>$r->revenue,
            'revpar'=>$r->revpar,
            'occ'   =>$r->occ,
            'adr' => $r->adr
        ];
    }
    return $revenueByCityArray;
}

function loadUser() {
    global $db,$uid;
requireRole('user');

//check if cache file exists and is made today, if so, load it. If not, make it.
$loadusercache_filename = __DIR__.'/../cache/'.$uid.'_loaduser';
$t = filemtime($loadusercache_filename);
if($t && (time()-$t  < 60*60*24) ) {
return unserialize(file_get_contents($loadusercache_filename));
}

$listings = $db->fetchAll("select Listing._id as _id,nickname,airbnbDownAt,title,isListed,active,basePrice,cleaningFee,address_full, address_lat, address_lng, accommodates, bedrooms, address_state, roomType,
address_city,airbnb_id,rentalsUnited_id,homeaway_id, leaseCost, furnitureCost, utilitiesCost, leaseStartDate, tags, tagsLocal, picture
from Listing
inner join User_Listing using(_id)
where User_Listing.user_id=$uid
and Listing.active and Listing.isListed
");
$listings_array = [];
foreach ($listings as $l) {
$listings_array[$l->_id] = $l;
}

$filters = getFilters();

$monthlystats = $db->fetchAll("select DATE_FORMAT(`date`,'%Y-%m') as month,

SUM(
IF(Reservation.status = 'canceled',
hostPayout / DATEDIFF(DATE(checkOut), DATE(checkIn)),
IF(ListingCalendar.status = 'booked',
(hostPayout - fareCleaning) / DATEDIFF(DATE(checkOut), DATE(checkIn)),
IF((Listing.isListed && Listing.active)	OR `date` <= Listing.lastActiveDate,
price,
0)
)
)
) AS rev,

100*(COUNT(DISTINCT(CONCAT(Reservation.listingId,date)))) / (COUNT(DISTINCT(Reservation.listingId))*DAY(LAST_DAY(date))) as occ,
SUM(((hostPayout-fareCleaning)/DATEDIFF(checkOut,checkIn)))/
SUM(CASE WHEN Reservation.status='canceled' THEN 0 ELSE 1 END) as adr,
AVG(DATEDIFF(checkOut,checkIn)) as staylength
FROM Reservation
left join ListingCalendar on ListingCalendar.date between Reservation.checkIn and DATE_SUB(Reservation.checkOut , interval 1 day)
and ListingCalendar.listingId = Reservation.listingId
inner join User_Listing on User_Listing._id = ListingCalendar.listingId
inner join Listing on User_Listing._id = Listing._id

$listingFilter

WHERE
Reservation.checkin BETWEEN DATE_FORMAT(DATE_ADD(CURRENT_DATE,interval -12 month),'%y-%m-01') and LAST_DAY(DATE_FORMAT(DATE_ADD(CURRENT_DATE,interval 12 month),'%y-%m-01'))
and

(Reservation.status='confirmed' or (Reservation.status='canceled' AND Reservation.hostPayout > 0))
and User_Listing.user_id = $uid
group by month order by month");
$userLastYearRev = $db->fetchAll("SELECT `month`, revsource, SUM(revenue) AS revenue
FROM monthlyCachedAnalytics
INNER JOIN User_Listing ON listingId = _id
INNER JOIN Listing on User_Listing._id = Listing._id
$listingFilter
WHERE  revsource != 'vacant'
AND user_id = $uid
GROUP BY revsource,`month`"
);

$revenueByCityArray = getRevenueByCityArray();
$toReturn = ["listings" => $listings_array, 'monthlystats' => $monthlystats, 'lastYearRev' => $userLastYearRev, 'revenueByCity'=>$revenueByCityArray];
file_put_contents($loadusercache_filename,serialize($toReturn));
return $toReturn;
}
function UpdateAvailability($a) {
    global $g;
    Guesty::login();
    echo "updating availability in guesty ".print_r($a, true);
    $g->query("availability-pricing/api/calendar/listings", $a, 'PUT');
}
function getReservations($start,$end,$confirmationsAlso="",$userFilterJoin="") {
    global $db,$listingFilter;
   return $db->fetchAll("select Reservation.*, Listing.nickname, Listing.bedrooms, Listing.address_city, Listing.airbnb_id, Listing.picture, CONCAT(Guest.firstName,' ',Guest.lastName) as fullName, 
IFNULL(Guest.firstName,Reservation.guestId) as firstName, IFNULL(Guest.lastName,'') as lastName, IFNULL(Guest.airbnb_url,'') as guestUrl, Reservation.spinnakerId  from Reservation 
                                                    inner join Listing on listingId=Listing._id
                                                    left join Guest on Guest._id = Reservation.guestId 
                                                    $userFilterJoin
                                                  where 
                                                  (Reservation.status='confirmed' or Reservation.status='canceled')
                                                  $listingFilter 
                                                  
                                                  and
                                                  (checkIn between $start and $end or
                                                   checkOut between DATE_ADD($start, INTERVAL 1 DAY) and DATE_ADD($end, INTERVAL 1 DAY) OR 
                                                   $start between checkIn and DATE_SUB(checkOut, INTERVAL 1 DAY)
                                                   $confirmationsAlso
                                                  )
                                                   ORDER BY Listing.nickname,Reservation.checkIn");
}
function BlockDates($listingId,$start,$end) {
    global $g;
    Guesty::login();
    if($start == $end) {
        $d = new DateTime($end);
        $d->modify('+1 day');
        $end = $d->format("Y-m-d");
    }
    if(!isset($listingId) || !$start || !$end) {
        error_log("Listing Id or start/end not set in block dates call!");
        return;
    }

    $response = $g->query("availability-pricing/api/calendar/listings/".$listingId, array(
        'startDate' => $start,
        'endDate'   => $end,
        'status'    => 'unavailable'
    ),'PUT');
    //print_r($response);
    /* Guesty hook will do this if the above was successful
    $db->query("
update ListingCalendar
 set status='unavailable'  
where listingId=".s($listingId)." 
and status='available'
and date between ".s($start)." and ".s($end));
*/
}

function UnblockDates($listingId,$start,$end) {
    global $g,$db;
    if(!isset($g)) {
        $guestyLogin = $db->fetchOne('select username,password from Integration where type="guesty"');
        $g = new Guesty($guestyLogin->username, $guestyLogin->password);
    }
    $g->query("availability-pricing/api/calendar/listings/".$listingId, array(
        'startDate' => $start,
        'endDate'   => $end,
        'status'    => 'available'
    ),'PUT');
    /* guesty hook will do this if the above was successful
    $db->query("
update ListingCalendar
 set status='available' 
where status='unavailable'
 and listingId=".s($listingId)." 
 and date between ".s($start)." and ".s($end));
    */

}
function printr_html($elem,$max_level=10,$stack=array()){
    $s='';
    if(is_array($elem) || is_object($elem)){
        if(in_array($elem,$stack,true)){
            return $s;
        }
        $stack[]=&$elem;
        if($max_level<1){
            return $s;
        }
        $max_level--;
        $s.= "<table border=1 cellspacing=0 cellpadding=3 width=100%>";
        if(is_array($elem)){
            $s.=  '<tr><td colspan=2 style="background-color:#333333;"><strong><font color=white>ARRAY</font></strong></td></tr>';
        }else{
            $s.=  '<tr><td colspan=2 style="background-color:#333333;"><strong>';
            $s.=  '<font color=white>OBJECT Type: '.get_class($elem).'</font></strong></td></tr>';
        }
        $color=0;
        foreach($elem as $k => $v){
            if($max_level%2){
                $rgb=($color++%2)?"#888888":"#BBBBBB";
            }else{
                $rgb=($color++%2)?"#8888BB":"#BBBBFF";
            }
            $s.=  '<tr><td valign="top" style="width:40px;background-color:'.$rgb.';">';
            $s.=  '<strong>'.$k."</strong></td><td>";
            $s.=  printr_html($v,$max_level,$stack);
            $s.=  "</td></tr>";
        }
        $s.=  "</table>";
        return $s;
    }
    if($elem === null){
        $s.=  "<font color=green>NULL</font>";
    }elseif($elem === 0){
        $s.=  "0";
    }elseif($elem === true){
        $s.=  "<font color=green>TRUE</font>";
    }elseif($elem === false){
        $s.=  "<font color=green>FALSE</font>";
    }elseif($elem === ""){
        $s.=  "<font color=green>EMPTY STRING</font>";
    }else{
        $s.=  str_replace("\n","<strong><font color=red>*</font></strong><br>\n",$elem);
    }
    return $s;
}