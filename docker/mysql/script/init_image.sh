#!/usr/bin/env bash

apt-get update && apt-get install -y supervisor net-tools wget procps nano
chmod u+x /init_container.sh
chmod u+x /entrypoint.sh


wget --no-check-certificate -O "flyway.tar.gz" "https://bintray.com/artifact/download/business/maven/flyway-commandline-$FLYWAY_VERSION-linux-x64.tar.gz"
tar -zxvf "flyway.tar.gz"  -C /opt/
ln -s "/opt/flyway-${FLYWAY_VERSION}" "/opt/flyway"

wget "http://central.maven.org/maven2/mysql/mysql-connector-java/5.1.36/mysql-connector-java-5.1.36.jar"
mv "mysql-connector-java-5.1.36.jar" "/opt/flyway/drivers"

mv /sqlScripts/* /opt/flyway/sql/

mkdir -p /home/mysql





