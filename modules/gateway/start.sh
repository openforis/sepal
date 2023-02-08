#!/usr/bin/env bash

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --config ../../dev-env/nodemon/nodemon.json \
    --watch "${MODULE}"/src \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9237 \
    src/main.js \
    --amqp-uri "amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT}" \
    --redis-uri "redis://gateway-redis" \
    --sepalHost="${SEPAL_HOST}" \
    --secure
else
  echo "Starting node"
  exec node \
      src/main.js \
      --amqp-uri "amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT}" \
      --redis-uri "redis://gateway-redis" \
      --sepalHost="${SEPAL_HOST}" \
      --secure
fi
