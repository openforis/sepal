#!/usr/bin/env bash

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9235 \
    src/main.js \
    --ip '0.0.0.0' \
    --port 8000 \
    --home-dir '/sepalUsers' \
    --ssh-script-path '/usr/local/bin/ssh_gateway.sh'
else
  echo "Starting node"
  exec node \
    src/main.js \
    --ip '0.0.0.0' \
    --port 8000 \
    --home-dir '/sepalUsers' \
    --ssh-script-path '/usr/local/bin/ssh_gateway.sh'
fi
