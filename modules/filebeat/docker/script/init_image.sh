#!/bin/sh

apt-get update -y && apt-get install -y apt-transport-https python curl
curl https://packages.elasticsearch.org/GPG-KEY-elasticsearch | apt-key add -
echo "deb https://packages.elastic.co/beats/apt stable main" | tee -a /etc/apt/sources.list.d/beats.list

apt-get update -y && apt-get install -y filebeat
