<?php

Class UsgsTiffRepo extends BaseController {
    //protected $table='usgs_data_repo'; 
    //public $timestamps=false;
	protected $dataset = 'LANDSAT_ETM';
	protected $soap_url = "https://earthexplorer.usgs.gov/inventory/soap";
    protected $layout = 'layouts.master';

	public sampletest(){

		return 'sample';
	}    
}
