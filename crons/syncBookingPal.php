<?php
require_once (__DIR__."/../tools/db.php");
require_once(__DIR__.'/../tools/bookingpalAPI.php');

$listings = $db->fetchAll("select * from Listing where isListed and active");

if(count($listings)<=0) {
    echo 'Error selecting listings, or no listings found.';
    exit;
}
$listings_to_create = array();
$listings_to_update = array();
$listings_to_delete = array();

$listingHash = array();

foreach($listings as $l) {
    $found=0;
    $l->bookingpal_listing = array(
        'supplierId' => '61609078',
        'name'      => $l->nickname?:'',
        'rooms'     => $l->bedrooms?:1,
        'bathrooms' => $l->bathrooms?:1,
        'persons'   => $l->accommodates?:2,
        'space'     => $l->areaSquareFeet?:'',
        'physicalAddress' => $l->address_street?:'',
        'latitude'  => $l->address_lat?:'',
        'longitude' => $l->address_lng?:'',
        'altId'     => $l->_id,
        'notes'     => array(
            'description' => $l->publicdescription_notes?:'',
            'shortDescription' => $l->publicdescription_summary?:'',
            'houseRules' => $l->publicdescription_rules?:''
        ),
    );
    $listingHash[$l->_id]=$l;
}


bookingPal_login(BOOKINGPAL_USER,BOOKINGPAL_PASSWORD);
$bookingpal_listings = bookingPal_getListings();

foreach($bookingpal_listings as $bl) {
    foreach($bl as $b) {
        if (isset($listingHash[$b->altId])) {
            $listings_to_update[] = $listingHash[$bl->altId]->bookingpal_listing;
            unset($listingHash[$b->altId]);
        } else {
            echo 'deleting listing from booking pal: ' . print_r($b, true);

            $listings_to_delete[] = array('id' => $b->id);
        }
    }
}

foreach($listingHash as $lh) {
    $listings_to_create[] = $lh->bookingpal_listing;
}
/*
$testlisting = '{"data": [{
		"name": "property 6",
		"locationId": 53244,
		"supplierId": 61609078,
		"persons": "2",
		"rooms": "2",
		"bathrooms": "2",
		"toilets": "2",
		"physicalAddress": "sfsdffsfs",
		"latitude": "40.7143528",
		"longitude": "-74.0059731",
		"childs": "1",
		"totalBeds": 3,
		"space": "200",
		"spaceUnit": "SQ_M",
		"altId": "",
		"attributes": ["RMA3", "RMA4"],
		"attributesWithQuantity": [{
				"attributeId": "HAC100",
				"quantity": 1
			},
			{
				"attributeId": "HAC90",
				"quantity": 4
			}
		],
		"notes": {
			"description": "Text of main description",
			"shortDescription": "short description",
			"houseRules": "House Rules descriiption"
		}
	}]
}';

*/

if(count($listings_to_create)>0) bookingPal_create($listings_to_create);
if(count($listings_to_update)>0) bookingPal_update($listings_to_update);
if(count($listings_to_delete)>0) bookingPal_delete($listings_to_delete);