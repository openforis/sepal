#!/usr/bin/env bash

LIBS=../../../lib/js
node \
    src/main.js \
    --gee-email google-earth-engine@openforis-sepal.iam.gserviceaccount.com \
    --gee-key-path $SEPAL_CONFIG/google-earth-engine/key.pem \
    --sepal-host localhost:3000 \
    --sepal-username 'sepalAdmin' \
    --sepal-password 'the admin password' \
    --home-dir $SEPAL_CONFIG/sepal-server/home/admin \
    --username admin
