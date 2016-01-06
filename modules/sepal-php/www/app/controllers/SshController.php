<?php


Class SshController extends \BaseController {

    public function requestSshSession(){
        $loggedUser = Session::get("username");
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

        $result = array ("authObject" => $valid_json_auth_object);
        return $result;
    }

    public function ssh(){
        return View::make('terminal.gateoneTerminal');
    }

}