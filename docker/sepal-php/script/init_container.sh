#!/usr/bin/env bash

wget -O "sepal-php.tar.gz"  "http://openforis.org/nexus/service/local/artifact/maven/redirect?r=public&g=org.openforis.sepal&a=sepal-php&v=$ARTIFACT_VERSION&e=tgz"
tar -zxvf sepal-php.tar.gz -C /var/www/html/
chown -R www-data:www-data /var/www/html

/usr/bin/supervisord
