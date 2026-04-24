<?php
chdir(__DIR__);
require_once("db.php");
require_once("Guesty.php");
$g = new Guesty();
$listings = $g->getListings();
foreach($listings as $l) {
    if(strpos($l->address->apartment,' ')!==false &&
        strpos($l->address->apartment,':')!==false) {
        echo "Found ".$l->address->apartment." for listing ".$l->_id." removing space and updating";
        $l->address->apartment = str_replace(' ','',$l->address->apartment);
        $listing = (object)[];
        $listing->_id = $l->_id;
        $listing->address = $l->address;

        $g->updateListing($listing);
    }
}

?>

