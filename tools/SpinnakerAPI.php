<?php
require_once(__DIR__.'/config.php');
require_once(__DIR__.'/api_functions.php');
class SpinnakerAPI {
    static function getVectorReservations($reservationId='') {
        global $db;
        $sql = "
        select Reservation._id as _id,
               Reservation.hostPayout as rate,
               Reservation.checkIn,
               Reservation.checkOut,
               Reservation.status as status,
               Reservation.spinnakerId,  
               Reservation.hostPayout,           
               Reservation.source,  
               Listing.address_apt as rooms,
               Listing.address_street as address1,
               Listing.address_city as city,
               Listing.address_state as state,
               Listing.address_country as country,       
               Listing.address_zipcode as zip,
               Reservation.guestId,
               Guest.firstName,
               Guest.lastName,
               Guest.phone,
               Guest.email
        from Listing 
        inner join User_Listing on Listing._id = User_Listing._id
        left join Reservation on Listing._id = Reservation.listingId
        left join Guest on Guest._id = Reservation.guestId
        where user_id = 84 and Listing.address_apt <> '' and Reservation.checkIn > CURDATE() ".($reservationId==''?" and (
         (spinnakerId is null and Reservation.status='confirmed') OR
         (Reservation.status='canceled' and spinnakerId is not NULL and spinnakerId <> '0')
         ) ":"");
        if($reservationId) {
            return $db->fetchOne($sql. " and Reservation._id = ".s($reservationId));
        }
        return $db->fetchAll($sql);
    }
    static function syncReservations() {
        global $g;
        if(!isset($g)) {
            $g = new Guesty();
        }
        $vr = SpinnakerAPI::getVectorReservations();
        echo "There are ".count($vr). " reservations to create or cancel in spinnaker.";
        $nullGuests = [];
        foreach($vr as $r) {
            if($r->firstName =='' || $r->firstName =='NULL') {
                error_log("Reservation without guest info: ".$r->_id." for guest: ".$r->guestId);
                $nullGuests[] = $r->guestId;
            }
            $nullcount = count($nullGuests);
            if($nullcount>0) {
                error_log("Found $nullcount reservations without guests");
                $guests = $g->getGuests($nullGuests);
                Guesty::insertGuests($guests);
                SpinnakerAPI::syncReservations();
                return;
            }
            if($r->status == 'canceled') {
                SpinnakerAPI::cancelReservation($r->_id);
            } else {
                SpinnakerAPI::createReservationFromVectorReservation($r);
            }
        }

    }
    static function blockAllListingsAvailability() {
        global $db;
        do {
            $listings = $db->fetchAll("
        select listingId, `date` from ListingCalendar
        inner join Listing on Listing._id = ListingCalendar.listingId
        inner join User_Listing on ListingCalendar.listingId = User_Listing._id 
        where user_id=84 and address_apt <> '' and status = 'available' and `date`>=CURDATE() order by listingId,`date` limit 5000");


            $neededBlocks = [];
            $neededBlocksCount=0;
            foreach ($listings as $listing) {
                if($neededBlocksCount>0 &&
                   $neededBlocks[$neededBlocksCount-1]["listingId"]==$listing->listingId &&
                    $neededBlocks[$neededBlocksCount-1]["endDate"]==date_sub(date_create($listing->date),new DateInterval("P1D"))->format("Y-m-d")
                ) {
                   $neededBlocks[$neededBlocksCount-1]["endDate"]=$listing->date;
                } else {
                    $neededBlocks[] = [
                        "listingId" => $listing->listingId,
                        "startDate" => $listing->date,
                        "endDate" => $listing->date,
                        "status" => "unavailable"
                    ];
                    $neededBlocksCount++;
                }
            }
            if ($neededBlocksCount > 0) {
                UpdateAvailability($neededBlocks);
                sleep(25);
            }
        } while(count($listings)==5000);
    }
    static function syncAvailability() {
        global $db;
        $data = $db->fetchAll("select distinct(address_apt) as roomtype from Listing 
        inner join User_Listing on Listing._id = User_Listing._id
        where user_id=84 and address_apt like '%:%'");
        foreach($data as $d) {
            $parts = explode(":",$d->roomtype);
            $spiAvailability = SpinnakerAPI::getAvailability($parts[0], $parts[1]);
            print_r($spiAvailability);
            $results = $db->fetchAll("
                select `date`, SUM(`status`='available') as numAvailable from Listing
                  inner join User_Listing on Listing._id = User_Listing._id
                  left join ListingCalendar on Listing._id = ListingCalendar.listingId
                where `date` >= CURDATE()
                and user_id = 84
                and address_apt = ".s($d->roomtype)."
                group by `date`        
            ");
            $vectorAvailability = [];
            foreach ($results as $r) {
                $vectorAvailability[$r->date] = $r->numAvailable;
                if(!isset($spiAvailability[$r->date])) {
                    $spiAvailability[$r->date] = 0;
                }
            }

            $neededBlocks = [];
            foreach ($spiAvailability as $key => $value) {
                if($value == 0 && isset($vectorAvailability[$key])) {
                //if (isset($vectorAvailability[$key]) && $vectorAvailability[$key] > $value) {
                    $count = $vectorAvailability[$key] - $value;
                    //we need to block some listings
                    if($count>0) {
                        echo 'we need to block ' . $count . ' listings for ' . $key . ' for ' . $d->roomtype;
                        $listings = $db->fetchAll("
select listingId, `date` from ListingCalendar
inner join Listing on Listing._id = ListingCalendar.listingId
inner join User_Listing on ListingCalendar.listingId = User_Listing._id 
where user_id=84 and address_apt = " . s($d->roomtype) . " and status = 'available' and `date`=" . s($key) . " limit $count");
                        foreach ($listings as $listing) {
                            $neededBlocks[] = [
                                "listingId" => $listing->listingId,
                                "startDate" => $listing->date,
                                "endDate" => $listing->date,
                                "status" => "unavailable"
                            ];
                        }
                    }
                } else if (isset($vectorAvailability[$key]) && $vectorAvailability[$key] < $value) {
                    //$count = $value - $vectorAvailability[$key];
                    //echo 'we need to open ' . $count . ' listings for ' . $key. ' for '.$d->roomtype;
                    // new logic now opening all our listings on any date that spi has even 1 availability for. After they show 0 available will block them all, in logic above
                    $listings = $db->fetchAll("
select listingId, `date` from ListingCalendar
inner join Listing on Listing._id = ListingCalendar.listingId
inner join User_Listing on ListingCalendar.listingId = User_Listing._id 
where user_id=84 and address_apt = ".s($d->roomtype)." and status = 'unavailable' and `date`=" . s($key) );//. " limit $count");
                    foreach ($listings as $listing) {
                        $neededBlocks[] = [
                            "listingId"=>$listing->listingId,
                            "startDate"=>$listing->date,
                            "endDate"=>$listing->date,
                            "status"=>"available"
                        ];
                    }
                }
            }
            if(count($neededBlocks)>0)
            UpdateAvailability($neededBlocks);
        }
    }
    static function fixPhone($phone) {
        $phone = str_replace('-','',$phone);
        if(strlen($phone)>9) {
            $phone = substr($phone,1);
        }
        return $phone;
    }
    static function createReservationFromVectorReservation($r) {
        global $db,$g;
        $marketingCodes = [
            "BWR"=>916,
            "FQR"=>922,
            "CCM"=>917,
            "PVH"=>918,
            "PVR"=>919,
            "HHI"=>920,
            "COT"=>921,
            "RFR"=>923,
            "RFRS"=>924
        ];
        if($r->firstName == '' || $r->lastName == '') {
            if(!isset($g)) { $g = new Guesty(); }
            $guests = $g->getGuests([$r->guestId]);
            if(count($guests)>0) {
                $guest = $guests[0];
                Guesty::insertGuests($guests);
                $r->firstName = $guest->firstName;
                $r->lastName = $guest->lastName;
                $r->phone = $guest->phone;
                $r->email = $guest->email;
            }
        }
        $pieces = explode(":",$r->rooms);
        $room_type = trim($pieces[1]);
        $resort = trim($pieces[0]);
        $data = [
            "Reservation"=> [
                "ReferenceId"=> $r->_id,
                "StayPriceSubtotal"=> 0,
                "StayPriceTotal"=>0,
                "Guests"=> [[
                    "FirstName"=>$r->firstName ?? 'unknown',
                    "LastName"=>$r->lastName ?? 'unknown',
                    "Phone" => SpinnakerAPI::fixPhone($r->phone),
                    "Email" => $r->email
                ]],
                "Arrival"=>date("m/d/Y",strtotime($r->checkIn)),
                "Departure"=>date("m/d/Y",strtotime($r->checkOut)),
                "RoomType"=>$room_type,
                "Adults"=>1,
                "Children"=>0,
                "ResortId"=>$resort,
                "BuildingName"=>"",
                "IncludeZeroRates"=>"true",
                "MarketCodesID" => $marketingCodes[$resort],
                "Comment" => $r->source.",".$r->hostPayout
            ]];
        $response = SpinnakerAPI::createReservation($data);
        if(isset($response->Value) && $response->Value != "0") {
            echo "Success response: ".print_r($response->Value,1);
            $db->query("update Reservation set spinnakerId = ".s($response->Value->reservationId)." where _id = ".s($r->_id));
        } elseif(is_array($response))  {
//2451 == no availability
            $response = $response[0];
            $s = "<html><body>Fail to create reservation.<br><br>Request:<br>".printr_html($data)."<br><br>Response:<br>".printr_html($response)."</body></html>";
            SpinnakerAPI::sendErrorMail("Spinnaker API failed to create reservation.",$s);
        }
    }

    static function updateReservationFromVectorReservation($r) {
        if($r->status == 'canceled') {
            SpinnakerAPI::cancelReservation($r->_id);
            return;
        }
        if(!$r->spinnakerId || $r->spinnakerId =='') {
            SpinnakerAPI::createReservationFromVectorReservation($r);
            return;
        }
        if(!isset($r->spinnakerId)) {
            error_log("Spinnaker Id not set as expected");
        }
        $result = SpinnakerAPI::query("WalkinReservation/" . $r->spinnakerId);

        $data = [
            "ReservationSubType"=> $result->Value->ReservationSubType,
            "ReasonForStayID"=> @$result->Value->ReasonForStayID,
            "MarketCodesID"=> @$result->Value->MarketCodesID,
            "SourceOfBusinessID"=> @$result->Value->SourceOfBusinessID,
            "Misc"=> null,
            "TravelAgencyID"=> @$result->Value->TravelAgencyID,
            "Guests"=> [[
                "ID"=> $result->Value->GuestID,
                "Salutation"=> null,
                "FirstName"=> $r->firstName ?? 'unknown',
                "LastName"=> $r->lastName ?? 'unknown',
                "Phone"=> $r->phone,
                "Address"=> "Unknown",
                "Address1"=> "Unknown",
//                "City"=> "Unknown",
//                "State"=> "Unknown",
//                "Zip"=> $r->zip,
                "CountryCode"=> 1,
                "CountryName"=> "United States of America",
                "Email"=> $r->email,
                "IsPrimaryGuest"=> true,
                "LanguageCode"=> null,
                "CountryShortName"=> "US",
                "CountryCodeA3"=> "USA",
                "OwnerID"=> null,
            ]],
        ];
        SpinnakerAPI::query("WalkinReservation/UpdateReservation/" . $r->spinnakerId, $data, "POST");

        $reservationRooms = SpinnakerAPI::query("WalkinReservation/".$r->spinnakerId."/ReservationRooms");
        $reservationRooms = $reservationRooms->Value;
        foreach($reservationRooms as $reservationRoom) {
            $data = [
                "ReservationRoomID" => $reservationRoom->ID,
                "ReservationID" => $r->spinnakerId,
                "ResortID" => $reservationRoom->ResortID,
                "RoomType" => $reservationRoom->RoomType,
                "RoomNumber" => $reservationRoom->RoomNumber,
                "BuildingName" => $reservationRoom->BuildingName,
                "Adults" => 1,
                "Children" => 0,
                "Other" => 0,
                "Arrival" => date("m/d/Y", strtotime($r->checkIn)),
                "Departure" => date("m/d/Y", strtotime($r->checkOut)),
                "HousekeepID" => $reservationRoom->HousekeepID,
                "IncludeZeroRates"=>"true",
                "InventoryGroupId" => $reservationRoom->InventoryGroupId
            ];

            SpinnakerAPI::query("WalkinReservation/UpdateReservationRoom/".$reservationRoom->ID, $data, "POST");
        }
    }

    static function getAvailability($resort,$roomType,$start="",$end="") {
        $resort = trim($resort);
        $roomType = trim($roomType);
        if($start=="") {
            $start = date("m/d/Y");
        }
        if($end == "") {
            $end = date("m/d/Y",strtotime($start)+60*60*24*180);
        }
        $data = [
            //"groupID"=>29,
            "groupID"=>29,
            "resortId"=>$resort,
            "roomTypeId"=>$roomType,
            "startDate"=>$start,
            "endDate"=>$end,
            "includeUnavailableRoomTypes"=>"false",
            "includeZeroRates"=>"true",
            "adults"=>1,
            "children"=>0
        ];
        $data = SpinnakerAPI::query("Availability/GetForWalkIn",$data);
        $availability = [];
        if(count($data->Value)>0 && count($data->Value[0]->AvailabilityByRoomType)>0 && isset($data->Value[0]->AvailabilityByRoomType[0]->RoomsAvailablePerDay)) {
            foreach ($data->Value[0]->AvailabilityByRoomType[0]->RoomsAvailablePerDay as $key => $value) {
                $availability[date("Y-m-d", strtotime($key))] = $value;
            }
        }
        return $availability;
    }

    static function createReservation($data) {
        return SpinnakerAPI::query("WalkinReservation", $data,"POST");
    }

    static function cancelReservation($vectorId) {
        global $db;
        $spinnakerId = $db->fetchValue("select spinnakerId from Reservation where _id=".s($vectorId));
        if($spinnakerId) {
            $response = SpinnakerAPI::query("WalkinReservation/" . $spinnakerId . "/Cancel", ["Note" => "Vector cancel due to update or cancel."], "POST");
            if($response->Value) {
                //cancel succeeded
                $db->query("update Reservation set spinnakerId = null where _id=".s($vectorId));
            }
        }
    }

    static function sendErrorMail($subject,$body) {
        try {
            $mandrill = new Mandrill(MANDRILL_SECRET);
            $mandrill->messages->send((object)[
                "subject" => $subject,
                "html" => $body,
                "from_email" => "donotreply@vectorstays.com",
                "to" => [
                    (object)["email" => "jesse@vectorstays.com"],
                    (object)["email" => "seth@vectorstays.com"],
                    (object)["email" => "clintonv@spinnakerresorts.com"],
                    (object)["email" => "joec@spinnakerresorts.com"],
                    (object)["email" => "mickey@vectorstays.com"],
                    (object)["email" => "jillian.berntsen@spiinc.com"],
                ]
            ]);
        } catch(Mandrill_Error $e) {
            error_log("A mandrill error occurred: ".$e->getMessage());
        }
    }

    static function query($path, $data='', $method="GET") {
        $num_attempts = 0;
        $auth = base64_encode("GuestConnect:VectorAPI123");
        do {
            if($num_attempts>0) {
                error_log("Spinnaker API unavailable. Retrying.");
            }
            $ch = curl_init();
            $path = "https://pmsapi.spinnakerresorts.com/api/" . $path;
            if ($method == 'GET' && $data) $path .= "?" . http_build_query($data);
            error_log("Calling spinnaker: " . $path);
            curl_setopt($ch, CURLOPT_URL, $path);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

            $headers = [
                'Content-Type: application/json; charset=utf-8',
                'Authorization: Basic ' . $auth
            ];

            if ($method == 'POST' || $method == 'PUT') {
                $json = json_encode($data);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
                $headers[] = 'Content-Length: ' . strlen($json);
            }
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            $jsonResponse = curl_exec($ch);
            $http_status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
        } while($http_status==503 && $num_attempts++<10 && !sleep(10));
        $dataResponse = @json_decode($jsonResponse);
        if($http_status!=200 && $http_status!=201 && $http_status!=0) {
            error_log("Http Status $http_status from spinnaker $path\nRequest: " . print_r($data, 1) . " \n\nResponse: ".$jsonResponse);
            SpinnakerAPI::sendErrorMail("ERROR in Spinnaker API Call","<html><body>Error $http_status in Spinnaker API Call to $path<br><br><br>Request:<br>" . printr_html($data) . "<br><br>Response:<br>" . ($dataResponse?printr_html($dataResponse):$jsonResponse) . "</body></html>");
        } else {
            error_log("Success from spinnaker $path\nRequest: " . print_r($data, 1) . " \n\n");
        }
        if($dataResponse) $dataResponse->http_status = $http_status;

        return $dataResponse;
    }
}