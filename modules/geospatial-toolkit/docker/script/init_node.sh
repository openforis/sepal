#!/bin/bash
set -e

echo
echo "**************************"
echo "*** Installing Node.js ***"
echo "**************************"

curl -sL https://deb.nodesource.com/setup_10.x | bash -
apt-get install -y nodejs
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
apt-get update && apt-get -y install yarn
npm install -g "git+https://github.com/openforis/earthengine-api.git#v0.1.171"
