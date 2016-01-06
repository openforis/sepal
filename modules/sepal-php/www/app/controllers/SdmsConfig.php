<?php

class SdmsConfig {
    private static $config;

    public static function value($name) {
        if (is_null(self::$config)) {
            self::$config = parse_ini_file('/etc/sepal-php/config.ini');
        }
        return self::$config[$name];
    }
}