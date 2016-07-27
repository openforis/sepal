#!/usr/bin/env bash

export worker_user=$1
export sepal_host=$2
export ldap_host=$3
export ldap_admin_password=$4
export sepal_user=$5
export sepal_password=$6

# TODO: This data needs to be passed in
account=$EE_ACCOUNT_SEPAL_ENV
privateKey=$EE_PRIVATE_KEY_SEPAL_ENV

downloadDir=/home/$worker_user/download

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

mkdir -p /etc/ssh/google-earth-engine
privateKeyPath=/etc/ssh/google-earth-engine/key.pem
echo -e $privateKey > $privateKeyPath

exec python ./src/server.py $account $privateKeyPath $downloadDir