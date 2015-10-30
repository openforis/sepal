<?php

Class VisualizeController extends \BaseController {
    protected $layout = 'layouts.master';

    public function showVisualization() {
        $userName = Session::get('username');
        $layers = $this->loadLayers($userName);
        $layerNames = array();
        $boxes = array();
        foreach ($layers as $layer) {
            array_push($layerNames, $layer['name']);
            array_push($boxes, $this->loadLayerBounds($userName, $layer['name']));
        }

        if (empty($boxes))
            $bbox = [[60, 180], [-60, -180]];
        else
            $bbox = $this->totalBounds($boxes);

        $dataToView['bbox'] = $bbox;
        $dataToView['userName'] = $userName;
        $dataToView['layers'] = $layerNames;
        $this->layout->content = View::make('visualize.visualize', $dataToView);
    }

    private function loadLayers($userName) {
        $curl = curl_init();
        $url = SdmsConfig::value('geoserverURI') . "rest/workspaces/$userName/coveragestores.json";
        curl_setopt($curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        curl_setopt($curl, CURLOPT_USERPWD, SdmsConfig::value('geoserverUser') . ':' . SdmsConfig::value('geoserverPassword'));
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
        $result = curl_exec($curl);
        $json = json_decode($result, true);
        if ($json['coverageStores'])
            return $json['coverageStores']['coverageStore'];
        else
            return array();
    }

    private function totalBounds($boxes) {
        $bbox = [[-999, -999], [999, 999]];
        foreach ($boxes as $box) {
            if ($box[0][0] > $bbox[0][0])
                $bbox[0][0] = $box[0][0];
            if ($box[0][1] > $bbox[0][1])
                $bbox[0][1] = $box[0][1];
            if (!is_null($box[1][0]) && $box[1][0] < $bbox[1][0])
                $bbox[1][0] = $box[1][0];
            if (!is_null($box[1][1]) && $box[1][1] < $bbox[1][1])
                $bbox[1][1] = $box[1][1];
        }
        return $bbox;
    }

    private function loadLayerBounds($userName, $layer) {
        $curl = curl_init();
        $url = SdmsConfig::value('geoserverURI') . "/rest/workspaces/$userName/coveragestores/$layer/coverages/$layer.json";
        curl_setopt($curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        curl_setopt($curl, CURLOPT_USERPWD, SdmsConfig::value('geoserverUser') . ':' . SdmsConfig::value('geoserverPassword'));
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
        $result = curl_exec($curl);
        $json = json_decode($result, true);
        $boxMap = $json['coverage']['latLonBoundingBox'];
        $box = array();
        $max = array();
        array_push($max, $boxMap['maxy']);
        array_push($max, $boxMap['maxx']);
        array_push($box, $max);
        $min = array();
        array_push($min, $boxMap['miny']);
        array_push($min, $boxMap['minx']);
        array_push($box, $min);
        return $box;
    }
}
