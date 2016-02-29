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
        $result = curl_exec($curl);
        $data['info'] = json_decode($result, true);
        $this->layout->content = View::make('account.account', $data);
    }

    public function closeSession() {
        $path = Input::get('path');
        $curl = curl_init();
        $url = "http://sepal:1025/data/$path";
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, "DELETE");
        curl_exec($curl);
        http_response_code(201);
    }
}
