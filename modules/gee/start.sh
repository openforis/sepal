#!/bin/sh

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
    --watch "${MODULE}/config" \
    --watch "${SHARED}" \
    --watch "${EE}" \
    --inspect=0.0.0.0:9229 \
    src/main.js
else
  echo "Starting node"
  exec node \
    src/main.js
fi
