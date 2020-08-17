#!/bin/bash
echo "Initing backup image"

apt-get -y update && apt-get install -y \
 cron \
 python-pip

pip2 install awscli
