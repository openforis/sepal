#!/usr/bin/env bash
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get -y update && apt-get install -y\
 curl\
 python3\
 python3-pip\
 libssl-dev\
 libffi-dev\
 gettext\
 git\
 supervisor\
 wget

wget -qO - https://www.mongodb.org/static/pgp/server-4.2.asc | apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.2.list  
curl -sL https://deb.nodesource.com/setup_8.x | bash -
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
apt-get update && apt-get install -y\
 mongodb-org\
 nodejs\
 yarn
