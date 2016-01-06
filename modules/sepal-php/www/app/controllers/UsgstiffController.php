<?php

class UsgstiffController extends \BaseController {

    protected $dataset = '';
    protected $soap_url = "https://earthexplorer.usgs.gov/inventory/soap";
    protected $wsdl_url = "https://earthexplorer.usgs.gov/inventory/soap?wsdl";

    /*
     * function to download zip 
     */

    public function migratetiff() {
        //getting data datasetId and SceneId to grab migrate
        Logger::debug('Requesting scene: ', Input::all());

        $sceneRequest = Session::get('sceneRequest');
        Logger::debug('$sceneRequest', $sceneRequest);

        $getDataSet = Input::get('datasetId');
        $requestScene = Input::get('requestScene');
        Session::forget('sceneRequest');


        if ($getDataSet > 5) {
            echo 'Invalid dataset.Please recheck your mapping';
            exit();
        } else {
            $datasetListsDB = DataSet::get();
            $datasetList = array();
            foreach ($datasetListsDB as $datasetListDB) {
                $datasetList[$datasetListDB->id] = $datasetListDB->dataset_value;
            }
            $this->dataset = $datasetList[$getDataSet];
        }
        $entityids = array($requestScene);
        //initiating nusoap bundle for laravel to trigger by passing soap url
        $client = new SoapClient($this->wsdl_url, array('soap_version' => SOAP_1_1, 'trace' => true,));
        //login to soap client with the credentials
        $login_response = $this->login($client);
        $api_key = $login_response['key'];
        //based on api key download function will trigger
        if ($api_key != "") {
            //trigger download function param: client object , api key , entityId
            $processingScript = Input::get('processingScript');
            $this->download($client, $api_key, $entityids, $processingScript);
        }
    }

    /*
     * function to validate tiff zip 
     */

    public function cronTiffValidator() {
        //initiating nusoap bundle for laravel to trigger by passing soap url
        $client = new SoapClient($this->wsdl_url, false);
        //login to soap client with the credentials
        $login_response = $this->login($client);
        $api_key = $login_response['key'];
        //based on api key download function will trigger
        if ($api_key != "") {
            //trigger download function param: client object , api key
            $this->tiffValidator($client, $api_key);
        }
    }

    /*
     * Login soap call 
     * returns the api key
     */

    public function login($client) {
        $error_soap = ""; //get the error in call
        $infokey = "";
        try {
            //passing login credentials
            $response = $client->__call('login', array(
                'Username' => SdmsConfig::value('usgsUser'),
                'Password' => SdmsConfig::value('usgsPassword'))); //Login soap call
            $infokey = $response; //return api key
        } catch (SoapFault $fault) {
            $error_soap = 'Error' . $fault->faultcode;
        }
        $output = array('key' => $infokey, 'error' => $error_soap);
        return $output;
    }

    /*
     * Soap call to validate files by passing newly updated datas 
     *
     */

    public function tiffValidator($client, $apikey) {
        $requestScene = 'LM40710131982218AAA03';
        $entityIds = array($requestScene, $requestScene);

        $download_param = array(
            'datasetName' => 'LANDSAT_MSS', //pass datasetname
            'apiKey' => $apikey,
            'node' => 'EE',
            'entityIds' => $entityIds, //Pass scene id
            'products' => array('STANDARD'), //pass STANDARD             
        );
        try {
            $downloadResult = $client->__call('download', $download_param); //download soap call
            $result = (array)$downloadResult;
            if (isset($result['item'])) {
                echo $result['item'];
            } else {
                echo 'no data available';
            }
        } catch (SoapFault $fault) {
            $error_soap = 'Error' . $fault->faultcode;
            echo $error_soap;
        }
    }

    /*
      tiff verificaton Db handler to verify dataupdate
     */

    public function tiffdbHandler($primaryKey, $status) {
        UsgsDataRepo::where('id', '=', $primaryKey)->update(array('tiffverification' => $status));
    }

    /*
     * first level status update
     *
     */

    public function checkTiff() {
        //getting data datasetId and SceneId to grab migrate
        $requestScene = Session::get('sceneRequest')['scenes'];

        $availabilityCheck = ImageLog::where("name", "=", $requestScene)->get();
        if (isset($availabilityCheck) && (count($availabilityCheck) > 0)) {
            echo $requestScene . '-ok';
        } else {
            echo $requestScene . '-no';
        }
    }

    /*
     * Soap call to download files
     *
     */

    public function download($client, $apikey, $entityids, $processingScript) {
        $sceneId = $entityids[0];
        Logger::debug('Download requested: ' . $sceneId);
        //check whether data available in repo
        if (isset($entityids[0])) {

            $availabilityCheck = ImageLog::where("name", "=", $entityids[0])
                ->where("accessed_by", "!=", "")->get();

            if (isset($availabilityCheck) && (count($availabilityCheck) > 0)) {
                Logger::debug('Scene in image log: ' . $sceneId);

                //Database activity 
                $current_date = date("Y-m-d H:i:s ");
                $userName = Session::get('username');
                $newAttributes = array('name' => $sceneId, 'accessed_by' => $userName, 'last_accessed' => $current_date);
                ImageLog::FirstOrCreate(['name' => $sceneId])->update($newAttributes);

                $userName = Session::get('username');

                $this->copyFromImageLogToUserDir($sceneId, $userName, $processingScript);

                echo $sceneId . '-ok';
                Logger::debug('Done copying scene from image log: ' . $sceneId);

                exit();
            }
        }

        $download_param = array(
            'datasetName' => $this->dataset, //pass datasetname
            'apiKey' => $apikey,
            'node' => 'EE',
            'entityIds' => $entityids, //Pass scene id
            'products' => array('STANDARD'), //pass STANDARD             
        );

        Logger::debug('Requesting scene download URL from USGS: ' . $sceneId);
        try {
            $downloadresult = $client->__call('download', $download_param); //download soap call
        } catch (SoapFault $fault) {
            Logger::error('Failed to download image ' . $sceneId, $fault);
            exit();
        }


        if ($downloadresult != "") {
            $result = (array)$downloadresult;
            if (isset($result['item'])) {
                Logger::debug('USGS responded: ' . $sceneId);
                if (count($result['item']) > 1) {
                    $i = 0;
                    foreach ($result['item'] as $item) {
                        $tiffZipUrl = $item;
                        if (!empty($tiffZipUrl)) {
                            $this->downloadFromUsgs($entityids[$i], $tiffZipUrl, $processingScript);
                        }
                        $i++;
                    }
                } else {
                    $this->downloadFromUsgs($sceneId, $result['item'], $processingScript);
                }
            } else {
                Logger::error('USGS responded with no data: ' . $sceneId);
                echo $sceneId . '-Sorry, the server responded with no data';
                exit();
            }
        }
    }

    private function downloadFromUsgs($sceneId, $tiffZipUrl, $processingScript) {
        $repoPath = '/data/sdms-data-repo/scene-zip/';
        $filenameOut = $repoPath . $sceneId . '.tar.gz';
        Logger::debug('Downloading scene: ' . $tiffZipUrl);
        if (copy($tiffZipUrl, $filenameOut)) {
            Logger::debug('Done downloading scene: ' . $tiffZipUrl);
            //Database activity
            $current_date = date("Y-m-d H:i:s ");
            $userName = Session::get('username');
            $newAttributes = array('name' => $sceneId, 'accessed_by' => $userName, 'last_accessed' => $current_date);
            ImageLog::FirstOrCreate(['name' => $sceneId])->update($newAttributes);


            exec("sudo mkdir /data/sdms-data-repo/scene-zip/$sceneId");
            Logger::debug('Unpacking: ' . $sceneId);
            exec("sudo tar -R -zxvf $filenameOut -C /data/sdms-data-repo/scene-zip/$sceneId");
            Logger::debug('Done unpacking: ' . $sceneId);

            exec("sudo ls /data/sdms-data-repo/scene-zip/$sceneId/gap_mask", $currentFolder);
            if (count($currentFolder) > 0) {

                Logger::debug('Unpacking nested archives: ' . $sceneId);
                foreach ($currentFolder as $keyFile => $valueFile) {
                    exec("sudo gzip -d /data/sdms-data-repo/scene-zip/$sceneId/gap_mask/$valueFile");
                    exec("sudo rm /data/sdms-data-repo/scene-zip/$sceneId/gap_mask/$valueFile");
                }
                Logger::debug('Done unpacking nested archives: ' . $sceneId);
            }


            $userName = Session::get('username');
            $this->copyFromImageLogToUserDir($sceneId, $userName, $processingScript);

            Logger::debug('Done with scene download: ' . $sceneId);
        } else {
            Logger::error('Failed to download scene: ' . $tiffZipUrl);
        }
        echo $sceneId . '-ok';
        exit();
    }

    private function copyFromImageLogToUserDir($sceneId, $userName, $processingScript) {
        $sourceDir = "/data/sdms-data-repo/scene-zip/$sceneId";
        $userRepository = "/data/home/$userName/downloads";
        $this->execAndLog("sudo chown $userName: $userRepository");
        $this->execAndLog("sudo mkdir -p $userRepository");

        $targetDir = "$userRepository/$sceneId";
        $this->execAndLog("sudo rm -rf $targetDir");

        if ($processingScript) {
            $scriptPath = ProcessingScripts::fullPath($processingScript);

            $tmpDir = "/data/tmp/$sceneId";
            $this->execAndLog("sudo rm -rf $tmpDir");
            $this->execAndLog("sudo cp -r $sourceDir $tmpDir");
            $this->execAndLog("sudo chown -R $userName: $tmpDir");
//            $this->execAndLog("sudo chmod -R 777 $tmpDir");
            $this->execAndLog("cd $tmpDir");
            $this->execAndLog("(cd $tmpDir && sudo -u $userName $scriptPath)");
            $this->execAndLog("cd -");
            $this->execAndLog("sudo mv $tmpDir $targetDir");
        } else {
            $this->execAndLog("sudo cp -r $sourceDir $targetDir");
            $this->execAndLog("sudo chown -R $userName: $targetDir");
        }
    }

    private function execAndLog($command, $output = null) {
        Logger::debug("exec: " . $command);
        $returnVal = null;
        exec($command, $output, $returnVal);
        Logger::debug("return: " . $returnVal);
    }

    function fileDownload($f_location, $f_name) {
        header('Content-Description: File Transfer');
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($f_location));
        header('Content-Disposition: attachment; filename=' . basename($f_name));
        readfile($f_location);
    }
}
