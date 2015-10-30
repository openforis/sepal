<?php

class CronUsgstiffController extends \BaseController {

	protected $dataset = 'LANDSAT_ETM';
	protected $soap_url = "https://earthexplorer.usgs.gov/inventory/soap";
    protected $layout = 'layouts.master';
	/*
	* function to download zip 
	*/
    public function migratetiff()
    {
    	$this->layout='';
    	//initiating nusoap bundle for laravel to trigger by passing soap url
	    $client =  new nusoap_client($this->soap_url, false);
	    //login to soap client with the credentials
		$api_key = $this->login($client);
		//based on api key download function will trigger
		if($api_key !=""){
			$entityids = array('LE70440332003151EDC00');
			$download = $this->download($client,$api_key,$entityids);	
		}
    }

	/*
	* Login soap call 
	* returns the api key
	*/
	public function login($client){ 
		//passing login credentials
		$response = $client->call('login',  array(
			    'Username'    =>    'sdms-fao',
			    'Password'    =>    'passwordfao1'));//Login soap call
		$error_soap = "";//get the error in call
		if ($client->fault) {
			$error_soap = 'Fault (Expect - The request contains an invalid SOAP body)'; 
			return $error_soap;
		} else {
			$err = $client->getError();
			if ($err) {
				$error_soap =  'Error' . $err;
				return $error_soap;
			} else {
				return $response;//return api key
			}
		}
	}

	/*
	*Soap call to download files
	*
	*/
	public function download($client,$apikey,$entityids){


		$download_param = array('node'=> 'EE',
	            'apiKey'    =>    $apikey,
	            'datasetName' => $this->dataset,//pass datasetname
	            'products'=>array('STANDARD'),//pass STANDARD 
	            'entityIds' =>$entityids //Pass scene id
	            ); 
		$result = $client->call('download', $download_param, $this->soap_url, $this->soap_url);//download soap call
		$error_soap = "";//get the error in call
		//print_r($result );

		if ($client->fault) {
			$error_soap = 'Fault (Expect - The request contains an invalid SOAP body)'; 
			//return $error_soap;
			echo $error_soap;
		} else {
			$err = $client->getError();
			if ($err) {
						$error_soap =  'Error' . $err;
						return $error_soap;
					  } 
					  else{

echo "<pre>";
print_r($result);
echo "</pre>";


			}
		}

	}
}
