<?php

//prod endpoint
//const BOOKINGPALAPI = 'https://rezcaster.mybookingpal.com/rezcasterapi/api/';

//demo endpoint
const BOOKINGPAL_API = 'https://demo.mybookingpal.com/rezcasterapi/api/';

const BOOKINGPAL_USER = 'demopms@revestment.com';
const BOOKINGPAL_PASSWORD = 'password';

function bookingPal_login($u,$p) {
    global $bookingpal_credentials;
    $bookingpal_credentials = bookingPal_request("authc/login", array(
        'username'=>$u,
        'password'=>$p
    ));
}



function bookingPal_create($data) {
    bookingPal_request('product', array("data"=>$data), 'POST');
}
function bookingPal_update($data) {
    bookingPal_request('product', array("data"=>$data), 'PUT');
}
function bookingPal_delete($data) {
    foreach($data as $l) {
        bookingPal_request('product/'.$l['id'], array("data"=>$l), 'DELETE');
    }
}

function bookingPal_getListings() {
    return bookingPal_request('product');
}


function bookingPal_request($path, $data=array(), $method='GET') {
    global $bookingpal_credentials;

    $url = BOOKINGPAL_API . $path.'?';
    if(isset($bookingpal_credentials->token)) $url.='jwt='.$bookingpal_credentials->token.'&';


    if($method!='GET') {
        $data = json_encode($data);
        $opts = array('http' =>
            array(
                'method' => $method,
                'header' => "Content-Type: application/json\r\n".
                            "Content-Length: ".strlen($data)."\r\n",
                'content' => $data
            )
        );
        $context = stream_context_create($opts);

        echo 'Calling booking pal '.$url. ' with '.print_r($opts, true);
        return json_decode(file_get_contents($url, false, $context));
    }
    $url = $url.http_build_query($data);
    echo 'Calling booking pal '.$url;
    $response = json_decode(file_get_contents($url));
    print_r($response);
    return $response;
}

