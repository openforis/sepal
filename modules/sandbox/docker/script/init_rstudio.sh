#!/bin/bash
set -e

echo
echo "*********************************"
echo "*** Installing RStudio Server ***"
echo "*********************************"
rstudio=rstudio-server-2021.09.0-351-amd64.deb
wget -nv https://download2.rstudio.org/server/bionic/amd64/$rstudio
gdebi -n $rstudio
printf '%s\n' \
    "server-app-armor-enabled=0" \
    >> /etc/rstudio/rserver.conf
rm -f $rstudio
