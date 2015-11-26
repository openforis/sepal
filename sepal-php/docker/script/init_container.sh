#!/usr/bin/env bash


chown -R www-data:www-data /var/www/html

/usr/bin/supervisord
