#!/usr/bin/env bash
LIBS=$SEPAL_HOME/lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/log \
    --watch $LIBS/httpClient \
    --watch $LIBS/httpServer \
    --inspect=0.0.0.0:9229 src/main.js \
    --gee-email google-earth-engine@openforis-sepal.iam.gserviceaccount.com \
    --gee-key-path $SEPAL_CONFIG/google-earth-engine/key.pem \
    --sepal-host localhost:3000 \
    --sepal-username 'sepalAdmin' \
    --sepal-password 'the admin password' \
    --home-dir $SEPAL_CONFIG/sepal-server/home/admin \
    --username admin
