#!/bin/bash

echo
echo "*******************************"
echo "*** Installing Shiny Server ***"
echo "*******************************"
wget https://download3.rstudio.org/ubuntu-12.04/x86_64/shiny-server-1.4.2.786-amd64.deb
gdebi -n shiny-server-1.4.2.786-amd64.deb
chown shiny:root /opt/miniconda3/lib/R/library
rm shiny-server-1.4.2.786-amd64.deb