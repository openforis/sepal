#!/bin/bash

echo
echo "***********************"
echo "*** Installing Java ***"
echo "***********************"
echo oracle-java8-installer shared/accepted-oracle-license-v1-1 select true | debconf-set-selections
apt-get install -y oracle-java8-installer
