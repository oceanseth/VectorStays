<?php
if ($_REQUEST['pw']!='dr0ne') {
    exit;
}

if ($_REQUEST['deploy'] == '1') {
    include("../tools/copyDBtoQA.php");
}
if($_REQUEST['regenerateCache']=='1') {
    chdir("../crons");
    include("../crons/nightlyCacheGeneration.php");
}


system("git fetch origin && git reset --hard origin/qa && git pull");

