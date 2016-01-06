<?php

class ProcessingScripts {
    public static function forSensor($sensor) {
        $processingDir = SdmsConfig::value('processingDir');
        $sensortName = DataSet::where('id', '=', $sensor)->get()[0]->dataset_value;
        $directory = $processingDir . '/' . $sensortName;
        $scripts = array();
        $map = array();
        if (file_exists($directory)){
            $scripts = array_slice(scandir($directory), 2); // Scripts without . and ..
            foreach ($scripts as $script) {
               $map[$sensortName . "/" . $script] = self::toName($script);
            }
        }

        return $map;
    }

    public static function fullPath($script) {
        return SdmsConfig::value('processingDir') . '/' . $script;
    }

    private static function toName($filename) {
        $info = pathinfo($filename);
        $withoutExt = basename($filename, '.' . $info['extension']);
        $withSpaces = str_replace('_', ' ', $withoutExt);
        return ucfirst($withSpaces);
    }
}