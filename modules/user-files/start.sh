#!/usr/bin/env bash

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${MODULE}/config" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9238 \
    src/main.js \
    --home-dir /sepalUsers \
    --poll-interval-milliseconds ${POLL_INTERVAL_MS} \
    --instances "$INSTANCES"
else
  echo "Starting node"
  exec node \
    src/main.js \
    --home-dir /sepalUsers \
    --poll-interval-milliseconds ${POLL_INTERVAL_MS} \
    --instances "$INSTANCES"
fi
