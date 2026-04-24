<?php
chdir(__DIR__);
require_once("db.php");
require_once("api_functions.php");
require_once("Guesty.php");
$g = new Guesty();
$guests = $g->getGuests(['61a637d1667d9400373c1a0c']);
Guesty::insertGuests($guests);
print_r($guests);
