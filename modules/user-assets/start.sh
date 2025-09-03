#!/bin/sh

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${MODULE}/config" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9229 \
    src/main.js \
    --redis-uri "redis://user-assets-redis" \
    --poll-interval-minutes ${POLL_INTERVAL_MINUTES}
else
  echo "Starting node"
  exec node \
    src/main.js \
    --redis-uri "redis://user-assets-redis" \
    --poll-interval-minutes ${POLL_INTERVAL_MINUTES}
fi
