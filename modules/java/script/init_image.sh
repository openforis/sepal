#!/usr/bin/env bash

apt-get -y update && apt-get install -y software-properties-common

apt-get -y update && apt-get install -qq -y \
    sudo \
    supervisor \
    gettext \
    curl \
    unzip \
    zip

# Installing Java
export SDKMAN_DIR=/usr/local/lib/sdkman
curl -s get.sdkman.io | bash
source "$SDKMAN_DIR/bin/sdkman-init.sh"
yes | sdk install java 11.0.11.hs-adpt

ln -s `which java` /usr/local/bin/java
JAVA_HOME=$(sdk home java current)
# Re-enable TLSv1 and TLSv1.1 for java mail
sed -i 's/jdk.tls.disabledAlgorithms=.*/jdk.tls.disabledAlgorithms=SSLv3, RC4, DES, MD5withRSA, /' $JAVA_HOME/conf/security/java.security
