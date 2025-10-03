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
    --redis-uri "redis://scene-metadata-redis" \
    --update-time ${UPDATE_TIME} \
    --min-days-published ${MIN_DAYS_PUBLISHED}
else
  echo "Starting node"
  exec node \
    src/main.js \
    --redis-uri "redis://scene-metadata-redis" \
    --update-time ${UPDATE_TIME} \
    --min-days-published ${MIN_DAYS_PUBLISHED}
fi
