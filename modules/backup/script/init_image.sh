#!/bin/bash
set -e
echo "Initializing backup image"

apt-get -y update && apt-get install -y \
 cron \
 python3 \
 python3-pip

pip3 install awscli
