<?php
require_once(__DIR__."/config.php");

class Guesty
{
    private $key, $secret,$token;

    function __construct($key="",$secret="",$token="") {
        if($key=="") {
           self::loadKeySecretFromDb();
        } else {
            // error_log("constructed new guesty $key $secret");
            $this->key = $key;
	    $this->secret = $secret;
	    $this->access_token=$token;
	}
	if(""==$this->access_token) {
		$this->refreshAccessToken();
	}
    }
    function refreshAccessToken() {
	global $db;
	$data = [
          'grant_type' => 'client_credentials',
          'scope' => 'open-api',
          'client_secret' => $this->secret,
          'client_id' => $this->key
        ];

      // Initialize cURL session
      $ch = curl_init('https://open-api.guesty.com/oauth2/token');

	// Set cURL options
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); // Return response as a string
	curl_setopt($ch, CURLOPT_POST, true); // Use POST method
	curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data)); // Encode data as URL-encoded form

	// Set headers
	curl_setopt($ch, CURLOPT_HTTPHEADER, [
    	'Accept: application/json',
    	'Content-Type: application/x-www-form-urlencoded',
	]);

	// Execute the cURL request and capture the response
	$response = curl_exec($ch);

	// Check for cURL errors
	if(curl_errno($ch)) {
    	echo 'cURL Error: ' . curl_error($ch);
	} else {
    		// Decode and print the JSON response
    		$response_data = json_decode($response);
		//var_dump($response_data);
		$this->access_token = $response_data->access_token;
		//echo "Got new guesty access token: ".$this->access_token;
	     $db->query("update Integration set token=".s($this->access_token)." where type='guesty'");
	}

	// Close cURL session
	curl_close($ch);
    }
    function loadKeySecretFromDb() {
        global $db;
        $i = $db->fetchOne("select * from Integration where type='guesty'");
        $this->key = $i->username;
	$this->secret = $i->password;
	$this->access_token=$i->token;
    }
    static function setupCustomForSync() {
        global $db;
        global $CURRENT_USER_ID;
        global $GUESTY_KEY;
        global $GUESTY_SECRET;
        global $g;
        global $last_run;

        $p = "vector";
        $db->select_db($p);
        $i = $db->fetchOne("select * from Integration where type='guesty' and _id = 3");
        $filename = __DIR__."/../crons/lastrun_".$p.'_'.$i->_id;

        $msg = "\r\n\r\nSetting up guesty for project $p integration ".$i->_id." on [" . date("Y-m-d H:i:s");
        echo $msg;

        if (file_exists($filename)) {
            $last_run = file_get_contents($filename);
            $last_run = substr($last_run,0,10);
        } else {
            $last_run = '1999-01-01';
        }

        $GUESTY_KEY = $i->username;
        $GUESTY_SECRET = $i->password;
	$GUESTY_TOKEN = $i->token;
        $CURRENT_USER_ID = 3;
        $g = new Guesty($GUESTY_KEY,$GUESTY_SECRET,$GUESTY_TOKEN);
        return $last_run;
    }
    static function login() {
        global $g,$db;
        if(!isset($g)) {
            $guestyLogin = $db->fetchOne('select username,password from Integration where type="guesty"');
            $g = new Guesty($guestyLogin->username, $guestyLogin->password);
        }
    }
    static function insertListingCalendars($calendarentries) {
        global $db;
        $columns = 'listingId,date,status,price,currency,reservationId';
        $columnsarray = explode(',', $columns);
        $listingCalendarCount=0;
        $sql = "insert ignore into ListingCalendar ($columns) values INSERTVALUESHERE on duplicate key update ";
        foreach ($columnsarray as $c) {
            $sql .= $c . '=VALUES(' . $c . '),';
        }
        $sql = rtrim($sql, ',');
        $values='';
        $x=1;
        foreach($calendarentries as $ce) {
            $listingCalendarCount++;
            if(!isset($ce->price)) continue;
            if ($values != '') $values .= ',';
            $values .= '(' .
                s($ce->listingId) . ',' .
                s($ce->date) . ',' .
                s($ce->status) . ',' .
                s($ce->price) . ',' .
                @s($ce->currency) . ',' .
                @s($ce->reservationId) .
                ')';

            if($x++%50==0) {
                $db->query(str_replace("INSERTVALUESHERE",$values,$sql));
                $values='';
            }
        }
        if($values=='') return 0;
        $db->query(str_replace("INSERTVALUESHERE",$values,$sql));
        return $db->affected_rows();
    }
    static function insertListings($listings) {
        global $db;
        $columns = '_id,accountId,createdAt,airbnb_id,rentalsUnited_id,homeaway_id,nickname,tags,isListed,'.
            'title,propertyType,roomType,accommodates,bedrooms, bathrooms, areaSquareFeet, defaultCheckInTime, defaultCheckOutTime,'.
            'active, address_full, address_city, address_state, address_country, address_zipcode, address_neighborhood,'.
            'address_street,address_apt,address_lat,address_lng,address_floor,address_searchable,basePrice,securityDepositFee,cleaningFee,picture,'.
            'publicdescription_summary,publicdescription_rules,publicdescription_notes';

        $sql='';
        $listingsCount=0;
        foreach($listings as $l) {
            if($sql!='') $sql.=',';
            $integrations = array();
            foreach($l->integrations as $i) {
                $platform = $i->platform;
                if(substr($platform,0,6)=='airbnb' && isset($i->$platform))
                    $integrations['airbnb']=$i->$platform->id;
                elseif($platform=='rentalsUnited' && isset($i->rentalsUnited))
                    $integrations['rentalsUnited']=$i->rentalsUnited->id;
                elseif($platform=='homeaway' && isset($i->homeaway))
                    $integrations['homeaway']=$i->homeaway->id;
            }
            $listingsCount++;

            $sql.='('.
                s($l->_id).','.
                s($l->accountId).','.
                s($l->createdAt).','.
                @s($integrations['airbnb']).','.
                @s($integrations['rentalsUnited']).','.
                @s($integrations['homeaway']).','.
                @s($l->nickname).','.
                s(implode(',',$l->tags)).','.
                s($l->isListed).','.
                @s($l->title).','.
                s($l->propertyType).','.
                s($l->roomType).','.
                s($l->accommodates).','.
                @s($l->bedrooms).','.
                @s($l->bathrooms).','.
                @s($l->areaSquareFeet).','.
                s($l->defaultCheckInTime).','.
                s($l->defaultCheckOutTime).','.
                s($l->active).','.
                s($l->address->full).','.
                s($l->address->city).','.
                s($l->address->state).','.
                s($l->address->country).','.
                @s($l->address->zipcode).','.
                @s($l->address->neighborhood).','.
                @s($l->address->street).','.
                @s($l->address->apartment).','.
                s($l->address->lat).','.
                s($l->address->lng).','.
                @s($l->address->floor).','.
                @s($l->address->address_searchable).','.
                @s($l->prices->basePrice).','.
                @s($l->prices->securityDepositFee).','.
                @s($l->prices->cleaningFee).','.
                @s($l->picture->thumbnail).','.
                @s($l->publicDescription->summary).','.
                @s($l->publicDescription->houseRules).','.
                @s($l->publicDescription->notes).')';

        }
if($listingsCount==0) return ["listingsAffected"=>0,"listingsCount"=>0];
        $sql = "insert ignore into Listing ($columns) values " . $sql . " on duplicate key update ";
        $columnsarray=explode(',', $columns);
        foreach($columnsarray as $c){
            $sql.=$c.'=VALUES('.$c.'),';
        }
        $sql=rtrim($sql,',');

        $db->query($sql);
        $listingsAffected = $db->affected_rows();
        return ["listingsAffected"=>$listingsAffected,"listingsCount"=>$listingsCount];
    }
    static function insertReservations($reservations) {
        global $db,$timezone;
        $sql='';

        $columns = '_id,accountId,listingId,createdAt,lastUpdatedAt,confirmedAt,confirmationCode,canceledAt,canceledBy,guestsCount,status,fareAccommodation,fareCleaning,hostPayout,totalPaid,currency,guestId,checkIn,checkOut,source,cityOccupancyTax,stateOccupancyTax';
        $columnsql='';

        $columnsarray = explode(',', $columns);
        foreach ($columnsarray as $c) {
            $columnsql .= $c . '=VALUES(' . $c . '),';
        }
        $columnsql = rtrim($columnsql, ',');

        foreach ($reservations as $r) {
            if ($sql != '') $sql .= ',';
            if($r->money && $r->money->invoiceItems)
            foreach($r->money->invoiceItems as $i) {
                if($i->type == "ADDITIONAL" &&
                    (strtolower($i->title)=="management fee" || strtolower($i->title) == "reservation fee" ||  strtolower($i->title) == "resort fee" )
                ) {
                    $r->money->netIncome = $r->money->netIncome - $i->amount;
                }
            }


            $sql .= '(' .
                s($r->_id) . ',' .
                s($r->accountId) . ',' .
                s($r->listingId) . ',' .
                "CONVERT_TZ(".s($r->createdAt) . ",'+00:00','$timezone')," .
                "CONVERT_TZ(".s($r->lastUpdatedAt) . ",'+00:00','$timezone')," .
                "CONVERT_TZ(".@s($r->confirmedAt) . ",'+00:00','$timezone')," .
                @s($r->confirmationCode) . ',' .
                "CONVERT_TZ(".@s($r->canceledAt) . ",'+00:00','$timezone')," .
                @s($r->canceledBy) . ',' .
                i($r->guestsCount) . ',' .
                s($r->status) . ',' .
                s($r->money->fareAccommodation) . ',' .
                @s($r->money->fareCleaning) . ',' .
                s($r->money->netIncome) . ',' .
                s($r->money->totalPaid) . ',' .
                s($r->money->currency) . ',' .
                s($r->guestId) . ',' .
                "CONVERT_TZ(".s($r->checkIn) . ",'+00:00','$timezone')," .
                "CONVERT_TZ(".s($r->checkOut) . ",'+00:00','$timezone')," .
                s($r->source) .",".
                "IF((select flat from TaxesByCity where nonTaxableSources like '''%".$r->source."%'''),0,(
                  (SELECT flat from TaxesByCity where city = (SELECT CONCAT(address_state,'_',address_city) from Listing where Listing._id=".s($r->listingId).")) +
                  ".$r->money->totalPaid."*(SELECT .01*percent from TaxesByCity where city = (SELECT CONCAT(address_state,'_',address_city) from Listing where Listing._id=".s($r->listingId)."))                  
                  )),".
                "IF((select flat from TaxesByState where nonTaxableSources like '''%".$r->source."%'''),0,((SELECT flat from TaxesByState where state = (SELECT address_state from Listing where Listing._id=".s($r->listingId)."))+
                ".($r->money->totalPaid==''?0:$r->money->totalPaid)."*(SELECT .01*percent from TaxesByState where state = (SELECT address_state from Listing where Listing._id=".s($r->listingId)."))".
                "))".
                ')';
        }
        if($sql=='') return 0;
        $sql = "insert ignore into Reservation ($columns) values " . $sql . " on duplicate key update " . $columnsql;
	echo $sql;
	@$db->query($sql);
        return $db->affected_rows();
    }
    static function insertGuests($guests) {
        global $db;
        $columns = '_id,firstName,lastName,phone,email,airbnb_url, address_street, address_city, address_country, address_zipCode';
        $sql = '';
        $guestCount=0;

        foreach ($guests as $guest) {
            if(!isset($guest->_id) || !isset($guest->firstName)) {
                error_log("Guest id or firstName not set, wtf is this object trying to insert as guest? ".print_r($guest,1));
                continue;
            }
            if(isset($guest->phone)) {
                $guestPhone = $guest->phone;
            } else if(isset($guest->phones) && @count($guest->phones)>0) {
                $guestPhone = $guest->phones[0];
            } else {
                $guestPhone = '';
            }
            $guestCount++;
            if ($sql != '') $sql .= ',';
            $sql .= '(' .
                s($guest->_id) . ',' .
                @s($guest->firstName) . ',' .
                @s($guest->lastName) . ',' .
                @s($guestPhone) . ',' .
                ((count($guest->emails) > 0) ? s($guest->emails[0]) : "''") . ',' .
                @s($guest->airbnb->url) . ',' .
                @s($guest->address->street) . ',' .
                @s($guest->address->city) . ',' .
                @s($guest->address->country) . ',' .
                @s($guest->address->zipCode) .
                ')';
        }
        if($sql=='') return 0;
        $sql = "insert ignore into Guest ($columns) values " . $sql . " on duplicate key update ";
        $columnsarray = explode(',', $columns);
        foreach ($columnsarray as $c) {
            $sql .= $c . '=VALUES(' . $c . '),';
        }
        $sql = rtrim($sql, ',');

        $db->query($sql);
    }
    public function getGuests($guestIds) {
        $guests = array();
        foreach($guestIds as $guestId) {
            error_log("Getting guest from guesty: $guestId");
            $result = self::query("guests/".$guestId, array(
                'fields' => '_id firstName lastName phones emails airbnb airbnb2 address'
            ));
            if(isset($result->message)) {
                error_log($result->message);
            } else {
                $guests[] = $result;
            }
        }
        return $guests;
    }

    public function getListingCalendars($listingIds, $fromDate='2015-01-01', $toDate='') {
        $toReturn=array();
        if(!$fromDate) $fromDate='2015-01-01';
        if(!$toDate) $toDate = date('Y-m-d', strtotime("+6 months"));
        foreach($listingIds as $id) {
            $result = self::query("listings/".$id."/calendar", array(
                'from' => $fromDate,
                'to' => $toDate,
                'fields' => '_id price status currency date reservationId listingId',
                'filters' => [['field'=>'price', 'operator'=>'$gt', 'value'=>0]]
            ));
            if($result) {
                $toReturn = @array_merge($toReturn, $result);
            }
        }

        return $toReturn;
    }
    public function updateListing($l) {
        //echo 'calling updateListing with data :'.json_encode($l);
        $this->query("/listings/".$l->_id, $l,"PUT");
    }
    public function getListings($onlyListed=false) {
        $listings = array();
        $increment = 40;
        $skip = 0;
        $total = 100000;
        if($onlyListed) {
            $filterArray = array(array(
                "field"=>'isListed',
                "operator"=>'$in',
                "value"=>array('true'),
            ));
        } else {
            $filterArray = array();
        }
        $errorcount=0;
        while ($skip < $total) {
            $result = self::query("listings", array(
                "limit" => $increment,
                "skip" => $skip,
                "fields" => 'integrations address prices nickname _id address_searchable customFields accountId createdAt nickname tags isListed '.
'title propertyType roomType accommodates bedrooms bathrooms publicDescription areaSquareFeet  defaultCheckInTime  defaultCheckOutTime active picture',
                "filters"=> $filterArray
            ));
            if(!$result) {
                error_log("error in guesty query to listings with increment $increment and skip $skip");
                if($errorcount++>10) {
                    error_log("too many errors, quitting");
		    return [];
                }
                continue;
            }
	    $skip += $increment;
            $total = count($result->results);

            foreach ($result->results as $l) {
                $listings[$l->_id] = $l;
                /*legacy bnbtracker/domo implementation for revestment
                foreach ($l->customFields as $cf) {
                    if ($cf->fieldId == "5a151500dfd1c6120004268b") {
                        $listings[$l->_id]->leaseCost = $cf->value;
                    }
                }
                */
            }
        }
        return $listings;
    }

    public function getReservations($updatedAfter='1999-01-01') {
        global $last_run_reservations_skip;
        if(!isset($last_run_reservations_skip)) $last_run_reservations_skip=0;
        $toReturn = array();
        $increment = 40;
        $total = 100000;
        $i=0;
        while($last_run_reservations_skip<$total && $i++<25) {
            $reservations = self::query("reservations",
                array(
                    "limit" => $increment,
                    "skip" => $last_run_reservations_skip,
                    "fields" => "status checkIn checkOut money nightsCount confirmedAt confirmationCode canceledBy canceledAt createdAt guestsCount integration address source lastUpdatedAt",
                    "filters" => array(
                        array(
                            "field" => 'lastUpdatedAt',
                            "operator" => '$gt',
                            "value" => $updatedAfter
                        )
                    )
                )
            );
            $last_run_reservations_skip += $increment;
	    if(is_null($reservations)) break;
	    $total = $reservations->count;

            $toReturn = array_merge($toReturn,$reservations->results);
        }
        return $toReturn;
    }

    public function query($path, $data = '', $method = 'GET')
    {
        usleep(400000); //make sure we not querying too fast for their fragile rate limits
        $ch = curl_init();
        $path = GUESTY_API . $path;
        if ($method=='GET'&&$data) $path .= "?" . http_build_query($data);
        error_log('querying guesty with '.$method.' to: '.$path."\n");
        curl_setopt($ch, CURLOPT_URL, $path);
        if($method=='POST') {
                    curl_setopt($ch, CURLOPT_POST, 1);
        }
        if($method=='POST'||$method=='PUT') {
            $data = json_encode($data);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        }
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
        $headers = [
            'Content-Type: application/json; charset=utf-8',
	    'Authorization: Bearer '.$this->access_token
        ];
        if($method=='PUT') {
            $headers[] ='Content-Length: ' . strlen($data);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $result = curl_exec($ch);
        curl_close($ch);
        return json_decode($result);
    }

}
