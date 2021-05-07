#!/bin/bash
set -e

echo
echo "****************************"
echo "*** Installing Azure CLI ***"
echo "****************************"

apt-get update -y && apt-get install -y sudo
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
