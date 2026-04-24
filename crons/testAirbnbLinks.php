<?php

    require_once (__DIR__."/../tools/db.php");

    function isAirbnbLinkGood($airbnb_id) {
        $link = 'https://www.airbnb.com/rooms/'.$airbnb_id;
        echo PHP_EOL.'querying --> '.$link;
        $ch = curl_init();
        $options = array(
            CURLOPT_URL => $link,
            CURLOPT_HEADER => true,
            CURLOPT_NOBODY => true,
            CURLOPT_ENCODING => '',
            CURLOPT_RETURNTRANSFER => true,
        );
        curl_setopt_array($ch, $options);
        $result = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $httpCode==200;
    }

    $db->select_db("stayintel");
    $projects = $db->fetchAll("SELECT id, name FROM domains");

    foreach($projects as  $project) {
        $p = $project->name;
        $db->select_db($p);

        $listings = $db->fetchAll("SELECT airbnb_id, _id as listingId, airbnbDownAt
            FROM Listing
            WHERE active
        ");

        $update = array();

        $yesterday = (new DateTime('yesterday'))->format('Y-m-d');

        foreach ($listings as $listing) {
            $linkStatus = isAirbnbLinkGood($listing->airbnb_id) ? 'NULL' : "'$yesterday'";
            $update[] = "('$listing->listingId', $linkStatus)";
        }

        $values = implode(',', $update);
        echo PHP_EOL.$values;
         if($values) {
            $sql = "INSERT INTO Listing(_id, airbnbDownAt)
                VALUES $values
                ON DUPLICATE KEY UPDATE airbnbDownAt=values(airbnbDownAt)";
            echo $sql;
            $db->query($sql);
        }
        $db->query("update Listing set airbnb_id_cache = airbnb_id where airbnb_id != 0");
    }


