<?php
for($i=24; $i>-12; $i--)
{
        $month = date("Y-m",strtotime("-".$i." month"));
        $from = "$month-01";
        $to   = date("Y-m-d 23:59:59",strtotime("$month +1 month -1 day"));
echo "\n$from - $to";
}
