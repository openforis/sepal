#!/usr/bin/env bash
set -e

if [ "$#" -ne 1 ]; then
    echo "create.sh: invalid arguments"
    echo "usage: ./create.sh [path]"
    exit 1;
fi

export CONFIG_HOME=$1
rm -rf /tmp/sepal-config/*
mkdir -p /tmp/sepal-config
chmod 777 /tmp/sepal-config
mkdir -p $CONFIG_HOME

echo "Creating Sepal config at $CONFIG_HOME. This is done in a Vagrant box, which might take a few minutes to start."

vagrant up
vagrant provision
USER_ID=`id -u`
vagrant ssh -c "python /usr/local/lib/sepal-config-generator/create.py $USER_ID /config"
rm -rf $CONFIG_HOME/*
mv /tmp/sepal-config/* $CONFIG_HOME