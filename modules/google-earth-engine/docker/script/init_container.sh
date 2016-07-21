#!/usr/bin/env bash


account=$EE_ACCOUNT_SEPAL_ENV
privateKey=$EE_PRIVATE_KEY_SEPAL_ENV

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

mkdir -p /etc/ssh/google-earth-engine
privateKeyPath=/etc/ssh/google-earth-engine/key.pem
echo -e $privateKey > $privateKeyPath

exec python ./src/server.py $account $privateKeyPath