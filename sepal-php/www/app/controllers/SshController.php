<?php


Class SshController extends \BaseController {

    public function requestSshSession(){
        $loggedUser = Session::get("username");
        $service_url = SdmsConfig::value('sepalURI').'/sandbox/'.$loggedUser;
        $curl = curl_init($service_url);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($curl, CURLOPT_VERBOSE, 1);
        curl_setopt($curl, CURLOPT_HEADER, 1);
        $response = curl_exec($curl);
        $header_size = curl_getinfo($curl, CURLINFO_HEADER_SIZE);
        $header = substr($response, 0, $header_size);
        $body = substr($response, $header_size);
        $secret = SdmsConfig::value('gateOneSecret');
        $authobj = array(
            'api_key' => SdmsConfig::value('gateOnePublic'),
            'upn' => $loggedUser,
            'timestamp' => time() . '0000',
            'signature_method' => 'HMAC-SHA1',
            'api_version' => '1.0'
        );
        $authobj['signature'] = hash_hmac('sha1', $authobj['api_key'] . $authobj['upn'] . $authobj['timestamp'], $secret);
        $valid_json_auth_object = json_encode($authobj);

        $result = array ( "response" => $body, "authObject" => $valid_json_auth_object);
        return $result;
    }

    public function ssh(){
        return View::make('terminal.gateoneTerminal');
    }

}