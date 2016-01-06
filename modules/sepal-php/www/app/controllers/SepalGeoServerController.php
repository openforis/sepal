<?php


Class SepalGeoServerController extends \BaseController {

    public function requestDownload() {
        $requestScene = Input::get('requestScene');
        $requestName = Input::get('requestName');
        $groupScenes = Input::get('groupScenes');
        $groupScenes = ($groupScenes == "yes") ? 'true' : 'false';
        $requestScene = explode(",", $requestScene);
        $dataSetId = 1;
        $userName = Session::get("username");
       // $user = User::where('username', $userName)->first();
       // $userId = $user->id;
        $processingScript = Input::get('processingScript');
        $scenesId = array();
        foreach ($requestScene as $sceneValue) {
            $sceneValues = explode("-", $sceneValue);
            if (count($sceneValues) == 2) {
                $dataSetId = $sceneValues[1];
                array_push($scenesId, $sceneValues[0]);
            }
        }
        $service_url = SdmsConfig::value('sepalURI').'/downloadRequests';
        $curl = curl_init($service_url);
        $data_string = '{"groupScenes": ' . $groupScenes . ', "requestName": "' . $requestName .'", "username" : ' . $userName . ',"dataSetId": ' . $dataSetId . ',"processingChain":"' . $processingScript . '","sceneIds":[' . implode(",", $scenesId) . ']}';
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_POST, true);
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, "POST");
        curl_setopt($curl, CURLOPT_POSTFIELDS, $data_string);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_HTTPHEADER, array(
                'Content-Type: application/json',
                'Content-Length: ' . strlen($data_string))
        );
        Logger::debug('Data String: ', $data_string);
        $result = curl_exec($curl);
        $httpcode = curl_getinfo($curl, CURLINFO_HTTP_CODE);

        Logger::debug('Response Status: ', $httpcode);
        $header_size = curl_getinfo($curl, CURLINFO_HEADER_SIZE);
        $body = substr($result, $header_size);
        Logger::debug('Response: ', $result);
        curl_close($curl);
        return $result;
    }

    public function removeFromDashboard(){
        $requestId = Input::get('requestId');
        $sceneId = Input::get('sceneId');
        $service_url = SdmsConfig::value('sepalURI').'/downloadRequests/'.$requestId;
        if (isset($sceneId) && trim($sceneId)!=''){
            $service_url = $service_url.'/'.$sceneId;
        }
        $curl = curl_init($service_url);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, "DELETE");
        $result = curl_exec($curl);
    }

    public function showDownloadStatus() {
        return View::make('dashboard.downloadStatus');
    }

    public function loadDownloadStatus() {
        $userName = Session::get("username");
        $url = SdmsConfig::value('sepalURI')."/downloadRequests/${userName}";
        $curl = curl_init($url);
        $result = curl_exec($curl);
//        return $result;
    }

}
