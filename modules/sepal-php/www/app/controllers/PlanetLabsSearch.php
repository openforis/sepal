<?php

class PlanetLabsSearch {
    private $query;

    const DATASET_ID = 9;

    public function __construct($query) {
        $this->query = $query;
        $this->query['sortby'] = '';
        $this->query['name'] = '';
    }

    public function search() {
        $curl = curl_init();
        $searchResults = array();
        Logger::debug('PlanetLabs query', $this->query);
        try {
            $url = 'https://api.planet.com/v0/scenes/ortho/';
            curl_setopt($curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
            curl_setopt($curl, CURLOPT_USERPWD, SdmsConfig::value('planetLabsApiKey') . ':');
            curl_setopt($curl, CURLOPT_URL, $url);
            curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
            $result = curl_exec($curl);
            $json = json_decode($result, true, 50);
            Logger::debug('PlanetLabs query response', $result);
            $searchResultCount = $json['count'];

            foreach ($json['features'] as $feature) {
                $properties = $feature['properties'];
                array_push($searchResults, array(
                    'id' => $feature['id'],
                    'dataset_id' => self::DATASET_ID,
                    'browseURL' => $properties['links']['thumbnail'],
                    'acquisitionDate' => substr($properties['acquired'], 0, 10),
                    'sensor' => 'PLANET_LAB_SCENES',
                    'path' => '',
                    'row' => '',
                    'cloudCoverFull' => $properties['cloud_cover']['estimated'],
                    'sceneID' => $feature['id']
                ));
            }
        } finally {
            curl_close($curl);
        }

        $pageNo = Input::get('page', 1);
        $perPage = 24;

        //pager handler
        if ($pageNo == 1) {
            $fromPage = 1;
            $toPage = $perPage;
        } else {

            $fromPage = $pageNo * $perPage + 1;
            $toPage = $pageNo * $perPage + $perPage;
        }

        $pagination = Paginator::make($searchResults, $searchResultCount, 24);
        $pageLink = array();
        $pageLink['link'] = $pagination->appends($this->query)->links();
        $pageLink['getFrom'] = $fromPage;
        $pageLink['getTo'] = $toPage;
        $pageLink['getTotalResult'] = $searchResultCount;

        $processingScripts = ProcessingScripts::forSensor(self::DATASET_ID);

        $result = array(
            'pageLink' => $pageLink,
            'datasetList' => $this->datasetList(),
            'details' => $this->details($searchResults),
            'test' => $searchResults,
            'search' => $this->query,
            'processingScripts' => $processingScripts
        );
        return $result;
    }

    function __toString() {
        return implode(", ", $this->query);
    }

    /**
     * @return array
     */
    private function datasetList() {
        $datasetListsDB = DataSet::get();
        $datasetList = array();
        foreach ($datasetListsDB as $datasetListDB) {
            if ($datasetListDB->dataset_active == 1) {
                $datasetList[$datasetListDB->id] = $datasetListDB->dataset_name;
            }
        }
        return $datasetList;
    }

    /**
     * @param $searchResults
     * @return array
     */
    private function details($searchResults) {
        $img_details = array();
        $i = 0;
        foreach ($searchResults as $searchResult) {
            $img_details[$i]['id'] = $searchResult['id'];
            $img_details[$i]['dataset_id'] = $searchResult['dataset_id'];
            $img_details[$i]['img'] = $searchResult['browseURL'];
            $img_details[$i]['acquisitionDate'] = $searchResult['acquisitionDate'];
            $img_details[$i]['sensor'] = $searchResult['sensor'];
            $img_details[$i]['path'] = $searchResult['path'];
            $img_details[$i]['row'] = $searchResult['row'];
            $img_details[$i]['cloud'] = $searchResult['cloudCoverFull'];
            $img_details[$i]['name'] = $searchResult['sceneID'];
            $img_details[$i]['extension'] = '.png';
            $i++;
        }
        return $img_details;
    }
}