#!/bin/bash



useradd -m -u 9999 sepal
wget -O "sepal.jar"  "http://openforis.org/nexus/service/local/artifact/maven/redirect?r=public&g=org.openforis.sepal&a=sepal-server&v=LATEST&e=jar"
mkdir /opt/sepal
mkdir /opt/sepal/bin
mv ./sepal.jar /opt/sepal/bin

