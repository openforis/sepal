#!/bin/bash

wget -O "sepal.jar"  "http://openforis.org/nexus/service/local/artifact/maven/redirect?r=public&g=org.openforis.sepal&a=sepal-server&v=$ARTIFACT_VERSION$ARTIFACT_SUFFIX&e=jar"
mv ./sepal.jar /opt/sepal/bin

sudo -u sepal java -jar /opt/sepal/bin/sepal.jar > /var/log/sepal/out.log 2>&1

