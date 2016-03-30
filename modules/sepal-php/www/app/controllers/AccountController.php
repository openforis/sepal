<?php

Class AccountController extends \BaseController {

//uses layout views/layouts/account.blade.phhp
    protected $layout = 'layouts.master';

//shows the user account
    public function showAccount() {
        $username = Session::get('username');
        $curl = curl_init();
        $url = "http://sepal:1025/data/sandbox/$username";
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        curl_setopt($curl, CURLOPT_USERPWD, SdmsConfig::value('adminUser') . ":" . SdmsConfig::value('adminPwd'));
        $result = curl_exec($curl);
        if($result === false) {
            $errorMessage = 'Failed to load account from ' . $url . ': ' . curl_error($curl);
            Logger::error($errorMessage);
            throw new Exception($errorMessage);
        }
        $data['info'] = json_decode($result, true);
        $this->layout->content = View::make('account.account', $data);
    }

    public function closeSession() {
        $username = Session::get('username');
        $sessionId = Input::get('path');
        $curl = curl_init();
        $url = "http://sepal:1025/data/sandbox/$username/session/$sessionId";
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, "DELETE");
        curl_setopt($curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        curl_setopt($curl, CURLOPT_USERPWD, SdmsConfig::value('adminUser') . ":" . SdmsConfig::value('adminPwd'));

        if(curl_exec($curl) === false) {
            $errorMessage = 'Failed to close session on url ' . $url . ': ' . curl_error($curl);
            Logger::error($errorMessage);
            throw new Exception($errorMessage);
        }
        http_response_code(201);
    }
}
