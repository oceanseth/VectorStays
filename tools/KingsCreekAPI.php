<?php
require_once(__DIR__.'/config.php');
class KingsCreekAPI {
    private $token;
    private $apiUrl;
    const LOGFILE = __DIR__.'/../logs/KingsCreek.log';

    function KingsCreekAPI($testmode=false) {
        $username = "VectorAccess";
        $password = 'V3ct0r@cc3e55!';
        $postdata = [
            'username' => $username,
            'password' => $password,
            'grant_type' => 'password'
        ];

        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL,"https://secure.kingscreekplantation.com/api/oauth2/token");
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postdata));

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        $result = curl_exec($ch);
        curl_close ($ch);
        $this->token = json_decode($result)->access_token;

        if($testmode) $this->apiUrl = "https://test.kingscreekplantation.com/api/vendors/";
        else $this->apiUrl = "https://secure.kingscreekplantation.com/api/vendors/";
    }
    static function getVectorReservations($reservationId='') {
        global $db;
        $sql = "
        select Reservation._id as number,
               Reservation.hostPayout as rate,
               Reservation.checkIn,
               Reservation.checkOut,
               Reservation.status as status,
               Reservation.confirmationCode,
               Listing.address_apt as rooms,
               Listing.address_state as state,
               Guest._id as guestId,
               Guest.firstName,
               Guest.lastName,
               Guest.phone,
               Guest.email,
               Guest.address_city as city,
               Guest.address_country as country,
               Guest.address_zipCode as zip,
               Guest.address_street as address1
        from Listing 
        inner join User_Listing on Listing._id = User_Listing._id
        left join Reservation on Listing._id = Reservation.listingId
        left join Guest on Guest._id = Reservation.guestId
        where user_id = 81 and Reservation.checkIn > CURDATE() and Reservation.status in ('canceled','confirmed')";
        if($reservationId) {
            return $db->fetchOne($sql. " and Reservation._id = ".s($reservationId));
        }
        return $db->fetchAll($sql);
    }
    function createReservationFromVectorReservation($r) {
        if($r->rooms=='') {echo "skipping create due to empty rooms"; return; }
        $this->createReservation([
            "rooms" => array_map(function($room) { return ["number"=>$room]; },explode(',',$r->rooms)),
            "firstName" => $r->firstName?:"Unknown",
            "lastName" => $r->lastName?:"Unknown",
            "checkIn" => $r->checkIn,
            "checkOut" => $r->checkOut,
            "rate" => $r->rate,
            "phones" => [[
                "id"=> $r->guestId,
                "type"=> "MOBILE",
                "number"=> $r->phone
            ]],
            "status"=>($r->status=='canceled')?'Cancelled':'Booked',
            "emails" => [[
                "id" => $r->guestId,
                "email" => $r->email
            ]],
            "addresses" => [[
                "id" => $r->number,
                "address1" => $r->address1?:'unknown',
                "zip" => $r->zip?:'90401',
                "city" => $r->city?:'unknown',
                "state" => $r->state?:'CA',
                "country" => $r->country?:'US'

            ]],
            "number" => $r->number,
            "specialNeeds" =>  []
        ]);
    }
    function updateReservationFromVectorReservation($r) {
        $kcReservations = $this->getReservations(["number"=>$r->number]);
        if($r->rooms=='') {
            echo "skipping update due to empty rooms";
            return;
        }
        $data = [
            "id" => "0",
            "rooms" => array_map(function($room) { return ["number"=>$room]; },explode(',',$r->rooms)),
            "firstName" => $r->firstName?:"Unknown",
            "lastName" => $r->lastName?:"Unknown",
            "checkIn" => $r->checkIn,
            "checkOut" => $r->checkOut,
            "rate" => $r->rate,
            "phones" => [[
                "id"=> $r->guestId,
                "type"=> "MOBILE",
                "number"=> $r->phone
            ]],
            "emails" => [[
                "id" => $r->guestId,
                "email" => $r->email
            ]],
            "status" => strtolower($r->status)=='canceled'?'Cancelled':'Booked',
            "addresses" => [[
                "id" => $r->number,
                "address1" => $r->address1,
                "zip" => $r->zip,
                "city" => $r->city,
                "state" => $r->state,
                "country" => $r->country

            ]],
            "number" => $r->number,
            "specialNeeds" =>  []
        ];
        $index = '';
        foreach($kcReservations as $key=>$kr) {
            if($kr->number == $r->number) {
                if($index=='') {
                    $index = $key;
                } else if($kcReservations[$key]->status=='Booked') {
                    $index = $key;
                }
            }
        }
        $roomOverride=false;
        if($index!='') {
            $data["id"] = $kcReservations[$index]->id;
            if(count($kcReservations[$index]->specialNeeds)>0) {
                foreach($kcReservations[$index]->specialNeeds as $v) {
                    if($v->needText == 'VECTORROOM') $roomOverride = true;
                }
            }
            if($roomOverride) {
                $data["rooms"] = $kcReservations[$index]->rooms;
                $data["specialNeeds"] = $kcReservations[$index]->specialNeeds;
            }
            $this->updateReservation($data);
        } else {
          unset($data["id"]);
          $this->createReservation($data);
        }
    }
    function getReservations($data='') {
        return $this->query("ListReservations",$data);
    }

    function getAvailability($start="",$end="") {
        if($start) {
            return $this->query("GetAvailRentalInv",["start"=>$start, "end"=>$end]);
        }
        return $this->query("GetAvailRentalInv");
    }

    function createReservation($data) {
        $existingReservationId="";
        $kcReservations = $this->getReservations(["number"=>$data['number']]);
        foreach($kcReservations as $kr) {
            if($kr->number == $data['number']) {
                $existingReservationId=$kr->id;
                break;
            }
        }
        if($existingReservationId!="") {
            $data["id"] = $existingReservationId;
            $this->query("UpdateReservation", $data, "POST");
            return;
        }

        if($data['status']=='Cancelled') { //create as booked and then update with cancelled
            $data['status']='Booked';
            $this->query("CreateReservation",$data,"POST");
            $data['status']='Cancelled';
            $kcReservations = $this->getReservations(["number"=>$data['number']]);
            foreach($kcReservations as $kr) {
                if($kr->number == $data['number']) {
                    $data["id"]=$kr->id;
                    break;
                }
            }
            if(isset($data["id"])) {
                $this->query("UpdateReservation", $data, "POST");
            }
            return;
        }
        $response = $this->query("CreateReservation",$data,"POST");
        echo print_r($response,1);
    }

    static function blockAllListingsAvailability() {
        global $db;
        do {
            $listings = $db->fetchAll("
        select listingId, `date` from ListingCalendar
        inner join Listing on Listing._id = ListingCalendar.listingId
        inner join User_Listing on ListingCalendar.listingId = User_Listing._id 
        where user_id=81 and address_apt <> '' and status = 'available' and `date`>=CURDATE() order by listingId,`date` limit 5000");


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

    static function sendErrorMail($s) {
        try {
            $mandrill = new Mandrill(MANDRILL_SECRET);
            $result = $mandrill->messages->send((object)[
                "subject" => "ERROR in Kings Creek API Call",
                "html" => $s,
                "from_email" => "donotreply@vectorstays.com",
                'preserve_recipients' => true,
                "to" => [
                    (object)["email" => "aman@vectorstays.com"],
                    (object)["email" => "seth@vectorstays.com"],
                    (object)["email" => "RHill@spinnakerresorts.com"],
                    (object)["email" => "jesse@vectorstays.com"],
                    (object)["email" => "awyatt@spinnakerresorts.com"]]
            ]);
        } catch(Mandrill_Error $e) {
            $result = $e->getMessage();
            error_log("A mandrill error occurred: ".$e->getMessage());
        }
        return $result;
    }
    function updateReservation($data) {
        if(!is_array($data)) $data = (array)$data;
      /* this doesnt seem to exist if($data['status'] =='Cancelled') {
            return $this->cancelReservation($data);
        }*/
        if(!isset($data['phones']) || $data['phones']==[] || $data['phones']=='[]') {
            $data['phones'] = [["id"=>0,"number"=>"1231231234","type"=>"mobile"]];
        }
        if(!isset($data['addresses']) || $data['addresses']==[] || $data['addresses']=='[]') {
            $data['addresses'] = [["id"=>0,"address1"=>"unknown st address", "city"=>"Syracuse", "state"=>"NY", "postalCode"=>"13296"]];
        }
        if(!isset($data['emails']) || $data['emails']==[]) {
            $data['emails'] = [["id"=>0,"email"=>"unknown@unknown.com"]];
        }
        return $this->query("UpdateReservation", $data, "POST");
    }
    function cancelReservation($data) {
        return $this->query("CancelReservation", $data, "POST");
    }
    function query($path,$data='', $method="GET") {
        $num_attempts=0;
        do {
            if($num_attempts>0) {
                error_log("Kings Creek API unavailable. Retrying.");
            }
            $ch = curl_init();
            $path = $this->apiUrl . $path;
            if ($method == 'GET' && $data) $path .= "?" . http_build_query($data);
            error_log("Calling kings creek: " . $path);
            curl_setopt($ch, CURLOPT_URL, $path);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

            $headers = [
                'Content-Type: application/json; charset=utf-8',
                'Authorization: Bearer ' . $this->token
            ];

            if ($method == 'POST' || $method == 'PUT') {
                $json = json_encode($data);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
                $headers[] = 'Content-Length: ' . strlen($json);
                echo $json . "\n";
            }

            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            $jsonResponse = curl_exec($ch);
            $http_status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $dataResponse = @json_decode($jsonResponse);
            @$dataResponse->http_status = $http_status;
        } while(($http_status==503 || @$dataResponse->message=='Still processing last request') && $num_attempts++<10 && !sleep(10));


        if($http_status!=200) {
            echo "*********\nError $http_status from kings creek $method $path ".$json?print_r($json,1):$data."\nResponse:".print_r($dataResponse)."\n******";
            $body = "
            Got $http_status error from kings creek $method $path <br/>
            Request:<br/> " . printr_html($data, 1) . "<br/>             
            Response:<br/> " . printr_html($dataResponse,1) . "
            ";
            KingsCreekAPI::sendErrorMail($body);
            return;
        }
        file_put_contents(KingsCreekAPI::LOGFILE, "Success from kings creek $path : ".print_r($data,1)."\nResponse: ".$dataResponse,FILE_APPEND );

        return $dataResponse;
    }
}