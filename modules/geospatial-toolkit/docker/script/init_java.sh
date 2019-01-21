#!/bin/bash
set -e

echo
echo "***********************"
echo "*** Installing Java ***"
echo "***********************"
export SDKMAN_DIR=/usr/local/lib/sdkman
curl -s get.sdkman.io | bash
source "$SDKMAN_DIR/bin/sdkman-init.sh"
yes | sdk install java 11.0.2-open
sdk install groovy

source "$SDKMAN_DIR/bin/sdkman-init.sh"
ln -s `which java` /usr/local/bin/java
ln -s `which groovy` /usr/local/bin/groovy

echo 'source "$SDKMAN_DIR/bin/sdkman-init.sh"' >> /etc/profile