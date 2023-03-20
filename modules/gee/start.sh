#!/usr/bin/env bash

# TODO: Look at this
#AUTH_CONFIG=$SEPAL_CONFIG/google-earth-engine/gee-oauth.json
#GEE_EMAIL=$(cat $AUTH_CONFIG | jq -r '.client_email')
#GEE_KEY=$(cat $AUTH_CONFIG | jq -r '.private_key' | sed -E ':a;N;$!ba;s/\r{0,1}\n/\\n/g')
if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=1 exec nodemon \
    --watch "${MODULE}/src" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9232 \
    src/main.js \
    --gee-email "$EE_ACCOUNT" \
    --gee-key "$EE_PRIVATE_KEY" \
    --sepal-endpoint "$SEPAL_ENDPOINT" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD"
else
  echo "Starting node"
  exec node \
    src/main.js \
    --gee-email "$EE_ACCOUNT" \
    --gee-key "$EE_PRIVATE_KEY" \
    --sepal-endpoint "$SEPAL_ENDPOINT" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD"
fi
