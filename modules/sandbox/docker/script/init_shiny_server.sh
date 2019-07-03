#!/bin/bash
set -e

echo
echo "*******************************"
echo "*** Installing Shiny Server ***"
echo "*******************************"
shinyServer=shiny-server-1.5.9.923-amd64.deb
wget -nv https://download3.rstudio.org/ubuntu-14.04/x86_64/$shinyServer
gdebi -n $shinyServer
chown shiny:root /usr/lib/R/library
rm $shinyServer

# Apply patch, allowing reconnect timeout to be configured
git clone https://github.com/openforis/shiny-server.git
cd shiny-server
git checkout fix
cp -r lib/* /opt/shiny-server/lib/
cp -r R/* /opt/shiny-server/R
cp -r config/shiny-server-rules.config /opt/shiny-server/config/
cd ..
rm -rf shiny-server

git clone https://github.com/openforis/shiny-server-client.git
cd shiny-server-client
git checkout reconnect-on-3000
yarn install
npm run prepublish
cp dist/* /opt/shiny-server/node_modules/shiny-server-client/dist/
cd ..
rm -rf shiny-server-client
