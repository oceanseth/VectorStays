<?php
require_once("../tools/db.php");
require_once("../tools/api_functions.php");
require_once("../tools/KingsCreekAPI.php");
require_once("../tools/Guesty.php");


$kc = new KingsCreekAPI();
$kcReservations = $kc->getReservations();
echo "there are ".count($kcReservations)." reservations saved in kc side\n";
foreach($kcReservations as $r) {
  echo $r->id." ".$r->number." ".substr($r->checkIn,0,10)." ".substr($r->checkOut,0,10)." ".$r->firstName." ".$r->lastName." ".$r->status." ".(count($r->rooms)>0?$r->rooms[0]->number:"")."\n";
}
?>
