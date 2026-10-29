#!/bin/bash
set -e

echo
echo "*************************************"
echo "*** Installing Google Cloud Tools ***"
echo "*************************************"

echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
apt-get -y update && apt-get -y install google-cloud-cli
