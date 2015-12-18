<?php

Class SearchController extends \BaseController {

    //uses layout views/layouts/master.blade.phhp
    protected $layout = 'layouts.master';

    /* function showForm
     * shows the search form
     */

    public function showForm() {
        //loading the view into the layout
        //view: views/search/searchForm.blade.php
        Session::forget('search_url');
        $datasetListsDB = DataSet::get();
        $datasetList = array();
        foreach ($datasetListsDB as $datasetListDB) {

            if ($datasetListDB->dataset_active == 1) {
                $datasetList[$datasetListDB->id] = $datasetListDB->dataset_name;
            }
        }
        $dataToView['datasetList'] = $datasetList;
        $this->layout->content = View::make('search.searchForm', $dataToView);
    }

    /* function searchDatabase
     * searches the databse accoring to the criteria provided
     */

    public function searchDatabase() {
        Session::put('search_url', URL::full());
        Validator::extend('must_be', function ($attribute, $value, $parameters) {

            $must1 = Input::get($parameters[0]);
            return strtotime($must1) <= strtotime($value);
        });
        Validator::extend('greater_than', function ($attribute, $value, $parameters) {
            $other = Input::get($parameters[0]);

            return isset($other) and intval($value) > intval($other);
        });
        Validator::extend('greater_than_or_equal', function ($attribute, $value, $parameters) {
            $other = Input::get($parameters[0]);

            return isset($other) and intval($value) >= intval($other);
        });

        // Setting validation rules
        $rules = array(
            'page' => 'integer',
            'identifier' => 'integer|min:1|max:2',
            'beginPath' => 'integer|min:1|max:233|required_with:beginRow',
            'endPath' => 'integer|min:1|max:233|greater_than_or_equal:beginPath|required_with:endRow',
            'beginRow' => 'integer|min:1|max:248|required_with:beginPath',
            'endRow' => 'integer|min:1|max:248|greater_than_or_equal:beginRow|required_with:endPath',
            'topLeftLatitude' => 'numeric|min:-90|max:90|required_with:topLeftLongitude',
            'topLeftLongitude' => 'numeric|min:-180|max:180|required_with:topLeftLatitude',
            'bottomRightLatitude' => 'numeric|min:-90|max:90|required_with:bottomRightLongitude',
            'bottomRightLongitude' => 'numeric|min:-180|max:180|required_with:bottomRightLatitude',
            'topLeftLatitude01' => 'numeric|min:-90|max:90|required_with:topLeftLongitude01',
            'topLeftLongitude01' => 'numeric|min:-180|max:180|required_with:topLeftLatitude01',
            'bottomRightLatitude01' => 'numeric|min:-90|max:90|required_with:bottomRightLongitude01',
            'bottomRightLongitude01' => 'numeric|min:-180|max:180|required_with:bottomRightLatitude01',
            'sceneStopTime' => 'date|must_be:sceneStartTime|required_with:sceneStartTime,name',
            'sceneStartTime' => 'date|required_with:sceneStopTime,name',
            'cloud_cover' => 'integer|min:1|max:100',
            'sensor' => 'required|integer|min:1|max:9'
        );
        //Setting messages to be shown on validation
        $messages = array();

        // Validating the inputs
        $v = Validator::make(Input::all(), $rules, $messages);
        // Was the validation successful?If not
        if ($v->fails()) {
            return Redirect::to('search')
                ->withErrors($v)
                ->withInput();
        } // Was the validation successful?If yes
        else {
            try {
                if (Input::get('sensor') == PlanetLabsSearch::DATASET_ID) {
                    $planetLabsSearch = new PlanetLabsSearch(Input::all());
                    $result = $planetLabsSearch->search();
                    $this->layout->content = View::make('search.allImages', $result);
                } else {
                    //defining an array to store the search criteria
                    //getting inputs to variables
                    $identifier = Input::get('identifier');
                    $beginPath = Input::get('beginPath');
                    $endPath = Input::get('endPath');
                    $beginRow = Input::get('beginRow');
                    $endRow = Input::get('endRow');
                    $sensor = Input::get('sensor');
                    $startDate = Input::get('sceneStartTime');
                    $startDateTemp = date_parse_from_format("Y-m-d", $startDate);
                    $startMonth = $startDateTemp['month'];
                    $startYear = $startDateTemp['year'];
                    $endDate = Input::get('sceneStopTime');
                    $endDateTemp = date_parse_from_format("Y-m-d", $endDate);
                    $endMonth = $endDateTemp['month'];
                    $endYear = $endDateTemp['year'];
                    $cloudCover = Input::get('cloud_cover');
                    $specificMonths = Input::get('name');
                    $topLeftLatitude = Input::get('topLeftLatitude01');
                    $topLeftLongitude = Input::get('topLeftLongitude01');
                    $bottomRightLatitude = Input::get('bottomRightLatitude01');
                    $bottomRightLongitude = Input::get('bottomRightLongitude01');
                    $topLeftLatitude1 = Input::get('topLeftLatitude');
                    $topLeftLongitude1 = Input::get('topLeftLongitude');
                    $bottomRightLatitude1 = Input::get('bottomRightLatitude');
                    $bottomRightLongitude1 = Input::get('bottomRightLongitude');
                    $sortby = Input::get('sortby');

                    //goes to search if any of the inputs/input combinations are set
                    if ($sensor) {
                        $searchSelectSqlForLimit = "SELECT `id`,`dataset_id`,`browseURL`,`acquisitionDate`,`sensor`,`path`,`row`,`cloudCoverFull`,`sceneID` FROM `usgs_data_repo` WHERE";
                        $searchSelectSqlForCount = "SELECT count(`dataset_id`) AS totalCount FROM `usgs_data_repo` WHERE";
                        $searchSql = '';
                        //If a particular Landsat is selected
                        if ($sensor == 7) {
                            //Searching all records for sensor = 1,2,3,4,5
                            $searchSql = $searchSql . " `dataset_id`>=1 AND `dataset_id`<=5";
                        } elseif ($sensor == 8) {
                            //Searching all records for sensor = 1,2
                            $searchSql = $searchSql . " `dataset_id`>=1 AND `dataset_id`<=2";
                        } else {
                            //Searching all records for sensor = selected landsat
                            $searchSql = $searchSql . " `dataset_id` = $sensor";
                        }
                        //If any row/path pair is specified
                        if (($identifier != '' && $identifier == 1) && (($beginRow && $beginPath) || ($endRow && $endPath))) {

                            if ($beginRow && $beginPath && $endRow && $endPath) {
                                //Searching all records for row>=start row value
                                $searchSql = $searchSql . " AND `row` >= $beginRow";
                                //Searching all records for path>=start path value
                                $searchSql = $searchSql . " AND `path` >= $beginPath";
                                //Searching all records for row<=end row value
                                $searchSql = $searchSql . " AND `row` <= $endRow";
                                //Searching all records for end path value<=end path value
                                $searchSql = $searchSql . " AND `path` <= $endPath";
                            } else if ($beginRow && $beginPath) {
                                //Searching all records for row=start row value
                                $searchSql = $searchSql . " AND `row` = $beginRow";
                                //Searching all records for path=start path value
                                $searchSql = $searchSql . " AND `path` = $beginPath";
                            } else if ($endRow && $endPath) {
                                //Searching all records for row=end row value
                                $searchSql = $searchSql . " AND `row` = $endRow";
                                //Searching all records for end path value=end path value
                                $searchSql = $searchSql . " AND `path` = $endPath";
                            }
                        }


                        //If start date & end date are set
                        if ($startDate && $endDate) {
                            //echo 'date';
                            if ($startDate == $endDate) {
                                //Searching all records for acquistionDate == start date/end date
                                $searchSql = $searchSql . " AND `acquisitionDate` = '" . $startDate . "'";
                            } else {
                                //Searching all records for acquistionDate >= start date
                                $searchSql = $searchSql . " AND `acquisitionDate` >= '" . $startDate . "'";
                                //Searching all records for acquisitionDate <= end date
                                $searchSql = $searchSql . " AND `acquisitionDate` <= '" . $endDate . "'";
                            }
                        }

                        //If there is a request for getting results from particular months
                        if ($specificMonths && $startDate && $endDate && $startMonth && $endMonth) {
                            $searchSql = $searchSql . " AND(";
                            //searching the requested months through all the years b/w start date and end date
                            for ($i = $startYear; $i <= $endYear; $i++) {
                                if ($startMonth <= $endMonth) {
                                    $start = $i . '-' . trim($startMonth) . '-1';
                                    $end = $i . '-' . trim($endMonth) . '-31';
                                    if ($i == $endYear) {
                                        $searchSql = $searchSql . "acquisitionDate BETWEEN '" . $start . "' AND '" . $end . "'";
                                    } else {
                                        $searchSql = $searchSql . "acquisitionDate BETWEEN '" . $start . "'' AND '" . $end . "' OR ";
                                    }
                                } else {
                                    $tempDate = $i + 1;
                                    $start = $i . '-' . $startMonth . '-1';
                                    $end = $tempDate . '-' . $endMonth . '-31';
                                    if ($i < $endYear) {
                                        if ($i == ($endYear - 1)) {
                                            $searchSql = $searchSql . "`acquisitionDate` BETWEEN '" . $start . "' AND '" . $end . "'";
                                        } else {
                                            $searchSql = $searchSql . "`acquisitionDate` BETWEEN '" . $start . "'' AND '" . $end . "' OR ";
                                        }
                                    }
                                }
                            }
                            $searchSql = $searchSql . ")";
                        }
                        //If latitude,longitude values of top left and bottom right of the area chosen are specified
                        if ($identifier != '' && $identifier == 2 && $topLeftLatitude1 != '' && $topLeftLongitude1 != '' && $bottomRightLatitude1 != '' && $bottomRightLongitude1 != '' && (($topLeftLatitude1 != $bottomRightLatitude1) || ($topLeftLongitude1 != $bottomRightLongitude1))) {
                            $searchSql = $searchSql . " AND (
                        ST_Intersects(
                        GEOMETRY, GEOMFROMTEXT( 'POLYGON(($topLeftLatitude1 $topLeftLongitude1, $topLeftLatitude1 $bottomRightLongitude1, $bottomRightLatitude1 $bottomRightLongitude1, $bottomRightLatitude1 $topLeftLongitude1, $topLeftLatitude1 $topLeftLongitude1))' )
                        )
                        OR ST_Contains(
                        GEOMETRY, GEOMFROMTEXT( 'POLYGON(($topLeftLatitude1 $topLeftLongitude1, $topLeftLatitude1 $bottomRightLongitude1, $bottomRightLatitude1 $bottomRightLongitude1, $bottomRightLatitude1 $topLeftLongitude1, $topLeftLatitude1 $topLeftLongitude1))' )
                        )
                        OR ST_Contains(
                        GEOMFROMTEXT( 'POLYGON(($topLeftLatitude1 $topLeftLongitude1, $topLeftLatitude1 $bottomRightLongitude1, $bottomRightLatitude1 $bottomRightLongitude1, $bottomRightLatitude1 $topLeftLongitude1, $topLeftLatitude1 $topLeftLongitude1))' ) , GEOMETRY
                        )
                        ) AND row <= 122";

                        } else if ($identifier != '' && $identifier == 2 && (($topLeftLatitude != '' && $topLeftLongitude != '') || ($bottomRightLatitude != '' && $bottomRightLongitude != ''))) {
                            if ($topLeftLatitude != '' && $topLeftLongitude != '') {
                                $latitude = $topLeftLatitude;
                                $longitude = $topLeftLongitude;
                            } else if ($bottomRightLatitude != '' && $bottomRightLongitude != '') {
                                $latitude = $bottomRightLatitude;
                                $longitude = $bottomRightLongitude;
                            }
                            $sql = "select * from((SELECT * FROM `wrs_points`   WHERE `centreLatitude` < $latitude AND `centreLongitude`<$longitude AND `row` <=122
                            ORDER BY `centreLatitude` DESC, `centreLongitude` DESC LIMIT 1) union (SELECT * FROM `wrs_points` WHERE  `centreLatitude` >= $latitude
                                AND `centreLongitude`>=$longitude AND `row` <=122 ORDER BY `centreLatitude` ASC, `centreLongitude` ASC LIMIT 1)) as `test`ORDER BY 
                                    `centreLatitude` ASC, `centreLongitude` ASC LIMIT 2";

                            $results = DB::select($sql);

                            $upperLat = $results[0]->centreLatitude;
                            $upperLong = $results[0]->centreLongitude;
                            $upperPath = $results[0]->path;
                            $upperRow = $results[0]->row;
                            $lowerLat = $results[1]->centreLatitude;
                            $lowerLong = $results[1]->centreLongitude;
                            $lowerPath = $results[1]->path;
                            $lowerRow = $results[1]->row;
                            $diffUpperLat = abs($latitude - $upperLat);
                            $diffUpperLong = abs($longitude - $upperLong);
                            $diffLowerLat = abs($lowerLat - $latitude);
                            $diffLowerLong = abs($lowerLong - $longitude);
                            if (($diffUpperLat + $diffUpperLong) <= ($diffLowerLat + $diffLowerLong)) {

                                $pathToSearch = $upperPath;
                                $rowToSearch = $upperRow;
                            } else {

                                $pathToSearch = $lowerPath;
                                $rowToSearch = $lowerRow;
                            }
                            if ($pathToSearch && $rowToSearch) {
                                $searchSql = $searchSql . " AND `row`=$rowToSearch AND `path`=$pathToSearch";
                            }
                        }
                        //If cloud cover is specified
                        if ($cloudCover != '' && $cloudCover != 100) {
                            //Searching records where cloudCover < requested cloud cover
                            $searchSql = $searchSql . " AND `cloudCoverFull` < $cloudCover";
                        }
                        //filter for valid tiff files
                        if (isset($sortby) && strlen($sortby) > 3) {
                            $sortArr = explode("-", $sortby);

                            if (isset($sortArr[1]) && ($sortArr[1] == 'asc')) {
                                $searchSql = $searchSql . " ORDER BY `$sortArr[0]` ASC";
                            } elseif (isset($sortArr[1]) && ($sortArr[1] == 'desc')) {
                                $searchSql = $searchSql . " ORDER BY `$sortArr[0]` DESC";
                            }
                            //Searching records where cloudCover < requested cloud cover
                            //
                        } else {
                            $searchSql = $searchSql . " ORDER BY `acquisitionDate` DESC";
                        }

                        $pageNo = Input::get('page', 1);
                        $perPage = 24;
                        $fromPage = $pageNo * $perPage - $perPage;
                        $toPage = $perPage;


                        $searchSqlWithLimit = $searchSql . " LIMIT $fromPage,$toPage";
                        $searchResults = DB::select($searchSelectSqlForLimit . $searchSqlWithLimit);
                        $searchResultCount = DB::select($searchSelectSqlForCount . $searchSql);
                        if (isset($searchResultCount) && count($searchResultCount)) {
                            foreach ($searchResultCount as $totalResCount) {
                                $searchResultCount = $totalResCount->totalCount;
                            }
                        } else {
                            $searchResultCount = 0;
                        }

                        //Pagination
                        $pagination = Paginator::make($searchResults, $searchResultCount, 24);

                        //saving search criteria into an $search array
                        $search = array('beginPath' => $beginPath, 'endPath' => $endPath, 'beginRow' => $beginRow, 'endRow' => $endRow,
                            'topLeftLatitude01' => $topLeftLatitude, 'topLeftLongitude01' => $topLeftLongitude,
                            'bottomRightLatitude01' => $bottomRightLatitude, 'bottomRightLongitude01' => $bottomRightLongitude,
                            'sensor' => $sensor, 'sceneStartTime' => $startDate, 'sceneStopTime' => $endDate, 'name' => $specificMonths,
                            'cloud_cover' => $cloudCover, 'topLeftLatitude' => $topLeftLatitude1, 'topLeftLongitude' => $topLeftLongitude1,
                            'bottomRightLatitude' => $bottomRightLatitude1, 'bottomRightLongitude' => $bottomRightLongitude1, 'sortby' => $sortby, 'identifier' => $identifier);

                        //pager handler
                        if ($pageNo == 1) {
                            $fromPage = 1;
                            $toPage = $perPage;
                        } else {

                            $fromPage = $pageNo * $perPage + 1;
                            $toPage = $pageNo * $perPage + $perPage;
                        }

                        $pageLink['link'] = $pagination->appends($search)->links();
                        $pageLink['getFrom'] = $fromPage;
                        $pageLink['getTo'] = $toPage;
                        $pageLink['getTotalResult'] = $searchResultCount;

                        //defining an array to store the search results
                        $img_details = array();
                        //defining index for each image
                        $i = 0;

                        foreach ($searchResults as $searchResult) {

                            $img_details[$i]['id'] = $searchResult->id;
                            $img_details[$i]['dataset_id'] = $searchResult->dataset_id;
                            $img_details[$i]['img'] = $searchResult->browseURL;
                            $img_details[$i]['acquisitionDate'] = $searchResult->acquisitionDate;
                            $img_details[$i]['sensor'] = $searchResult->sensor;
                            $img_details[$i]['path'] = $searchResult->path;
                            $img_details[$i]['row'] = $searchResult->row;
                            $img_details[$i]['cloud'] = $searchResult->cloudCoverFull;
                            $img_details[$i]['name'] = $searchResult->sceneID;
                            $img_details[$i]['extension'] = '.jpg';

                            $i++;
                        }

                        $datasetListsDB = DataSet::get();
                        $datasetList = array();
                        foreach ($datasetListsDB as $datasetListDB) {
                            if ($datasetListDB->dataset_active == 1) {
                                $datasetList[$datasetListDB->id] = $datasetListDB->dataset_name;
                            }
                        }
                        //redirecting to search results page
                        $processingScripts = ProcessingScripts::forSensor($sensor);
                        $this->layout->content = View::make('search.allImages', array(
                            'pageLink' => $pageLink,
                            'datasetList' => $datasetList,
                            'details' => $img_details,
                            'search' => $search,
                            'processingScripts' => $processingScripts
                        ));
                    } //If no inputs are set
                    else {
                        return Redirect::to('search');
                    }
                }
            } catch (Exception $e) {
                echo $e->getMessage();
            }
        }
    }

    /* function make_thumb
     * function to handle thumb creation
     */

    public function make_thumb($src, $dest, $desired_width) {

        /* read the source image */
        $fileExtension = pathinfo($src, PATHINFO_EXTENSION);
        if ($fileExtension == 'jpg')
            $source_image = imagecreatefromjpeg($src);
        else if ($fileExtension == 'png')
            $source_image = imagecreatefrompng($src);
        else {
            Logger::error('Unsupported file extension:' . $src);
            exit();
        }
        $width = imagesx($source_image);
        $height = imagesy($source_image);

        /* find the "desired height" of this thumbnail, relative to the desired width  */
        $desired_height = floor($height * ($desired_width / $width));

        /* create a new, "virtual" image */
        $virtual_image = imagecreatetruecolor($desired_width, $desired_height);

        /* copy source image at a resized size */
        imagecopyresampled($virtual_image, $source_image, 0, 0, 0, 0, $desired_width, $desired_height, $width, $height);

        /* create the physical thumbnail image to its destination */
        imagejpeg($virtual_image, $dest);
    }


    /* function imageRepo
     * function to handle download from USGS server to our repository
     */

    public function imageRepo() {
        $this->layout = '';
        $imageName = Input::get('imageName');
        $imageUrl = Input::get('imageUrl');
        $imageFlag = Input::get('imageFlag');
        $datasetId = Input::get('datasetId');

        $imageExistanceCheck = ImageLog::select("id");
        $imageExistanceCheck = $imageExistanceCheck->where('name', '=', $imageName);
        $imageExistanceResult = $imageExistanceCheck->get();
        if (count($imageExistanceResult) > 0) {

            $current_date = date("Y-m-d H:i:s");
            $userName = Session::get('username');
            $newAttributes = array('name' => $imageName, 'accessed_by' => $userName, 'last_accessed' => $current_date);
            ImageLog::FirstOrCreate(['name' => $imageName])->update($newAttributes);
            $pathFull = "/data/sdms-data-repo/scene-image/" . $imageName;
            $typeFull = pathinfo($pathFull, PATHINFO_EXTENSION);
            $dataFull = file_get_contents($pathFull);
            $base64Full = 'data:image/' . $typeFull . ';base64,' . base64_encode($dataFull);

            $path = "/data/sdms-data-repo/scene-image/thumbnail/" . $imageName;
            $type = pathinfo($path, PATHINFO_EXTENSION);
            $data = file_get_contents($path);
            $base64 = 'data:image/' . $type . ';base64,' . base64_encode($data);
            $responseArray = array(
                array(
                    "thumb" => $base64,
                    "highresol" => $base64Full,
                    "imageFlag" => $imageFlag
                )
            );
            echo json_encode($responseArray);
        } else {
            $repoPath = '../../../../../data/sdms-data-repo/scene-image/';
            $filenameOut = $repoPath . basename($imageName);
            if ($datasetId == PlanetLabsSearch::DATASET_ID) {
                $context = stream_context_create(array(
                    'http' => array(
                        'header' => "Authorization: Basic " . base64_encode(SdmsConfig::value('planetLabsApiKey') . ':')
                    )
                ));
                $contentOrFalseOnFailure = file_get_contents($imageUrl, false, $context);
            } else {
                $contentOrFalseOnFailure = file_get_contents($imageUrl);
            }
            $byteCountOrFalseOnFailure = file_put_contents($filenameOut, $contentOrFalseOnFailure);
            $this->make_thumb($repoPath . basename($imageName), $repoPath . 'thumbnail/' . basename($imageName), '180');


            $current_date = date("Y-m-d H:i:s");
            $userName = Session::get('username');
            $newAttributes = array('name' => $imageName, 'accessed_by' => $userName, 'last_accessed' => $current_date);
            ImageLog::FirstOrCreate(['name' => $imageName])->update($newAttributes);


            $pathFull = "/data/sdms-data-repo/scene-image/" . $imageName;
            $typeFull = pathinfo($pathFull, PATHINFO_EXTENSION);
            $dataFull = file_get_contents($pathFull);
            $base64Full = 'data:image/' . $typeFull . ';base64,' . base64_encode($dataFull);

            $path = "/data/sdms-data-repo/scene-image/thumbnail/" . $imageName;
            $type = pathinfo($path, PATHINFO_EXTENSION);
            $data = file_get_contents($path);
            $base64 = 'data:image/' . $type . ';base64,' . base64_encode($data);
            $responseArray = array(
                array(
                    "thumb" => $base64,
                    "highresol" => $base64Full,
                    "imageFlag" => $imageFlag
                )
            );
            echo json_encode($responseArray);
        }
    }

    /* function copyImages
     * copyImage alias Migrate from URL : ajax post response to 
     * copy file from sdms repo to user home repo
     */

    public function copyImages() {
        //no layout needed because of ajax request
        $this->layout = '';
        //get requsted scenes ajax response
        $requestScenes = Input::get('requestScenes');

        if ($requestScenes) {
            //get logged in username and session user key for ssh ftp access
            $userName = Session::get('username');
            $userkey = Session::get('userkey');

            //ssh connection establishing
            $sshConnection = ssh2_connect(SdmsConfig::value('host'), 22);
            //ssh ftp authentication with username and key
            ssh2_auth_password($sshConnection, $userName, $userkey);
            //ssh FTP trigger for file transfer
            $sshFTP = ssh2_sftp($sshConnection);
            //creating the home sdms repository if not created
            ssh2_sftp_mkdir($sshFTP, '/data/home/' . $userName . '/downloads');
  
            //loopig each image as a unique request
            foreach ($requestScenes as $filenameIn) {
                //copying and moving file from SEPAL repo to the user home directory sdms repo.
                ssh2_scp_send($sshConnection, '/var/www/html/public/repository/' . $filenameIn, '/data/home/' . $userName . '/downloads/' . $filenameIn, 0644);

                //Database activity 
                $current_date = date("Y-m-d H:i:s ");
                $newAttributes = array('name' => $filenameIn, 'last_accessed' => $current_date);
                ImageLog::firstOrCreate(['name' => $filenameIn])->update($newAttributes);
            }
            //close ssh connection and unset the availabel variable for better performance
            ssh2_exec($sshConnection, 'exit');
            unset($sshConnection);
        }
        echo 1;
    }

    /* function removeImages
     * to remove images and zip based on the interval set by admin
     * this file will executes in a interval of 6 hours that setup in cron
     */

    public function removeImages() {

        $this->layout = '';
        //getting current date
        $current_date = date("Y-m-d H:i:s ");

        $cronDetailDb = ConfigDetails::where('name', '=', 'cron_delay_days')->get();

        foreach ($cronDetailDb as $valueCron)
            $delDate = $valueCron->value;

        $daysAgo = strtotime("-$delDate day", strtotime($current_date));
        $daysAgo = date('Y-m-j H:i:s', $daysAgo);

        //getting details of images which are last accessed one week ago
        $imgsToDelete = ImageLog::select();
        $imgsToDelete = $imgsToDelete->where('last_accessed', '<=', $daysAgo)
            ->where('last_accessed', '=', NULL, 'OR');
        $imgsToDelete = $imgsToDelete->get();
        //If any files from the list are in the repository, deleting it from repository

        foreach ($imgsToDelete as $imgToDelete) {
            $tempName = $imgToDelete->name;
            $stripName = explode(".", $tempName);


            if (isset($stripName[1]) && ($stripName[1] == 'jpg')) {// remove jpg 
                exec("sudo rm /data/sdms-data-repo/scene-image/$tempName");
                exec("sudo rm /data/sdms-data-repo/scene-image/thumbnail/$tempName");
                ImageLog::where('name', '=', $tempName)->delete();
            } else {// remove zip 
                exec("sudo rm /data/sdms-data-repo/scene-zip/$tempName.tar.gz");
                exec("sudo rm -R /data/sdms-data-repo/scene-zip/$tempName/");
                ImageLog::where('name', '=', $tempName)->delete();
            }
        }
    }

    /*
     * function adjustZoom
     * 
     */

    function adjustZoom() {
        //no layout needed because of ajax request
        $this->layout = '';
        //get requsted scenes ajax response
        $beginPath = Input::get('beginpath');
        $beginRow = Input::get('beginrow');
        $endPath = Input::get('endpath');
        $endRow = Input::get('endrow');
        $upperLeftLatitude = '';
        $upperLeftLongitude = '';
        $lowerRightLatitude = '';
        $lowerRightLongitude = '';
        $boxCoordinates = array();
        if ($beginPath != '' && $beginRow != '' && $endPath != '' && $endRow != '') {
            $test = abs($beginPath - $endPath);
            $test1 = $beginPath + ($test / 2);
            $test1 = round($test1);
            $testr = abs($beginRow - $endRow);
            $testr1 = $beginRow + ($testr / 2);
            $testr1 = round($testr1);
            $boxTopLeft = WrsCornerPoint::select('centreLatitude', 'centreLongitude')
                ->where('path', '=', $test1)
                ->where('row', '=', $testr1)
                ->get();

            if (count($boxTopLeft) > 0) {

                foreach ($boxTopLeft as $boxTopLeftValue) {

                    //$boxCoordinates1[] = array('centreLat' => $boxTopLeftValue->centreLatitude,
                    //    'centreLong' => $boxTopLeftValue->centreLongitude);
                    $boxCoordinates1[] = array($boxTopLeftValue->centreLatitude, $boxTopLeftValue->centreLongitude);
                }
                echo json_encode($boxCoordinates1);
            }
        } else if ($beginPath != '' && $beginRow != '') {

            $boxTopLeft = WrsCornerPoint::select('centreLatitude', 'centreLongitude')
                ->where('path', '=', $beginPath)
                ->where('row', '=', $beginRow)
                ->get();

            if (count($boxTopLeft) > 0) {

                foreach ($boxTopLeft as $boxTopLeftValue) {

                    //$boxCoordinates1[] = array('centreLat' => $boxTopLeftValue->centreLatitude,
                    //    'centreLong' => $boxTopLeftValue->centreLongitude);
                    $boxCoordinates1[] = array($boxTopLeftValue->centreLatitude, $boxTopLeftValue->centreLongitude);
                }
                echo json_encode($boxCoordinates1);
            } else {
                echo 0;
            }
        } else if ($endPath != '' && $endRow != '') {
            $boxBottomRight = WrsCornerPoint::select('centreLatitude', 'centreLongitude')
                ->where('path', '=', $endPath)
                ->where('row', '=', $endRow)
                ->get();
            if (count($boxBottomRight) > 0) {
                foreach ($boxBottomRight as $boxTopRightValue) {
                    // $boxCoordinates1[] = array('centreLat' => $boxTopRightValue->centreLatitude,
                    //   'centreLong' => $boxTopRightValue->centreLongitude);
                    $boxCoordinates1[] = array($boxTopRightValue->centreLatitude,
                        $boxTopRightValue->centreLongitude);
                }
                echo json_encode($boxCoordinates1);
            } else {
                echo 0;
            }
        }

        exit();
    }

    /* function pathtoLatLong
     * pathtoLatLong is to conver the path row input to latitude longitude : ajax post response  
     * to draw in map.
     */

    public function pathtoLatLong() {
        //no layout needed because of ajax request
        $this->layout = '';
        //get requsted scenes ajax response
        $beginPath = Input::get('beginpath');
        $beginRow = Input::get('beginrow');
        $endPath = Input::get('endpath');
        $endRow = Input::get('endrow');

        //if ($reqPath && $reqRow) {
        //get data from database by giving path row to get lat and long
        if (!empty($beginPath) && !empty($beginRow) && !empty($endPath) && !empty($endRow)) {
            $latlongData = DB::table('wrs_points')->select("upperLeftLatitude", "upperLeftLongitude", "upperRightLatitude", "upperRightLongitude", "lowerLeftLatitude", "lowerLeftLongitude", "lowerRightLatitude", "lowerRightLongitude")
                ->where('path', '>=', $beginPath)
                ->where('row', '>=', $beginRow)
                ->where('path', '<=', $endPath)
                ->where('row', '<=', $endRow)
                ->orderBy('path', 'asc')
                ->take(2501)
                ->get();
        } else if ((!empty($beginPath) && !empty($beginRow)) || (!empty($endPath) && !empty($endRow))) {
            $pathToSearch = 0;
            $rowToSearch = 0;
            if (!empty($beginPath) && !empty($beginRow)) {
                $pathToSearch = $beginPath;
                $rowToSearch = $beginRow;
            } else {
                $pathToSearch = $endPath;
                $rowToSearch = $endRow;
            }
            $latlongData = WrsCornerPoint::select("upperLeftLatitude", "upperLeftLongitude", "upperRightLatitude", "upperRightLongitude", "lowerLeftLatitude", "lowerLeftLongitude", "lowerRightLatitude", "lowerRightLongitude")
                ->where('path', '=', $pathToSearch)
                ->where('row', '=', $rowToSearch)
                ->get();
        }

        $coordinates = array();

        if (count($latlongData) > 0) {

            foreach ($latlongData as $latlongValue) {
                $coordinates[] = array(
                    $latlongValue->upperLeftLatitude,
                    $latlongValue->upperLeftLongitude,
                    $latlongValue->upperRightLatitude,
                    $latlongValue->upperRightLongitude,
                    $latlongValue->lowerRightLatitude,
                    $latlongValue->lowerRightLongitude,
                    $latlongValue->lowerLeftLatitude,
                    $latlongValue->lowerLeftLongitude);
            }
        }
        echo json_encode($coordinates);
        exit();
        // }
        //close ssh connection and unset the availabel variable for better performance
    }

}

