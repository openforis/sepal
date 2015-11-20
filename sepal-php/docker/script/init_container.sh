#!/usr/bin/env bash


tar -zxvf sepal-php.tar.gz -C /var/www/html/
chown -R www-data:www-data /var/www/html

/usr/bin/supervisord
