#!/bin/bash
echo "Initing backup image"

apt-get -y update && apt-get install -y \
 cron \
 python3-pip

pip3 install awscli
