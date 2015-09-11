#!/bin/bash
sleep 30
if ["$DOCKER_VERSION" = ""]; then
	echo "DOCKER_VERSION must be specified"
	exit 1
fi
sudo apt-get -q -y update
sudo apt-get -q -y install docker.io=${DOCKER_VERSION}
