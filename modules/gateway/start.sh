#!/usr/bin/env bash

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9237 \
    src/main.js \
    --redis-uri "redis://gateway-redis" \
    --sepalHost="${SEPAL_HOST}" \
    --secure
else
  echo "Starting node"
  exec node \
      src/main.js \
      --redis-uri "redis://gateway-redis" \
      --sepalHost="${SEPAL_HOST}" \
      --secure
fi
