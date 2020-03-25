#!/usr/bin/env bash
LIBS=$SEPAL_HOME/lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9229 src/main.js \
    --gee-email google-earth-engine@openforis-sepal.iam.gserviceaccount.com \
    --gee-key-path $SEPAL_CONFIG/google-earth-engine/gee-service-account.pem \
    --google-project-id 'openforis-sepal' \
    --sepal-host localhost:3000 \
    --sepal-username 'sepalAdmin' \
    --sepal-password 'the admin password' \
    --home-dir /var/sepal/sepal-server/home/admin \
    --username admin
