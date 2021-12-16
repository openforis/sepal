#!/usr/bin/env bash

AUTH_CONFIG=$SEPAL_CONFIG/google-earth-engine/gee-oauth.json
GEE_EMAIL=$(cat $AUTH_CONFIG | jq -r '.client_email')
GEE_KEY=$(cat $AUTH_CONFIG | jq -r '.private_key' | sed -E ':a;N;$!ba;s/\r{0,1}\n/\\n/g')
LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9232 \
    src/main.js \
    --gee-email "$GEE_EMAIL" \
    --gee-key "$GEE_KEY" \
    --sepal-host localhost:3000 \
    --sepal-username 'sepalAdmin' \
    --sepal-password 'the admin password'
