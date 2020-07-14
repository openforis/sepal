#!/usr/bin/env bash
set -e

apt-get -y update && DEBIAN_FRONTEND=noninteractive apt-get install -y\
 curl\
 python3-pip\
 libssl-dev\
 libffi-dev\
 gettext\
 git\
 supervisor\
 wget

curl -sL https://deb.nodesource.com/setup_8.x | bash -
apt-get install -y nodejs
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
apt-get update && apt-get -y install yarn

cd /usr/local/lib
export MONGODB=mongodb-linux-x86_64-2.6.10
wget https://fastdl.mongodb.org/linux/$MONGODB.tgz
tar -xvf $MONGODB.tgz
rm $MONGODB.tgz
ln -sf $MONGODB mongodb
cp -f mongodb/bin/* /usr/local/bin/
cd -
