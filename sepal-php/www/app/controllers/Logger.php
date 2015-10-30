<?php

class Logger {

    public static function debug($message, $object=null) {
        self::log('DEBUG', $message, $object);
    }

    public static function info($message, $object=null) {
        self::log('INFO', $message, $object);
    }

    public static function warn($message, $object=null) {
        self::log('WARN', $message, $object);
    }

    public static function error($message, $object=null) {
        self::log('ERROR', $message, $object);
    }

    private static function log($level, $message, $object=null) {
        if (is_null($object))
            error_log($level.': '.$message.'. ');
        else
            error_log($level.': '.$message.'. '.self::toString($object));
    }

    private static function toString($object=null) {
        ob_start();                    // start buffer capture
        var_dump( $object );           // dump the values
        $contents = ob_get_contents(); // put the buffer into a variable
        ob_end_clean();                // end capture
        return trim($contents);
    }
}