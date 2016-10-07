#!/bin/bash

echo
echo "*********************************"
echo "*** Installing RStudio Server ***"
echo "*********************************"
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen \
	&& locale-gen en_US.utf8 \
	&& /usr/sbin/update-locale LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
wget https://download2.rstudio.org/rstudio-server-0.99.484-amd64.deb
gdebi -n rstudio-server-0.99.484-amd64.deb
rm -f rstudio-*
