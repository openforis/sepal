#!/usr/bin/env bash

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9239 \
    src/main.js \
    --repo-dir /var/sepal/${MODULE_NAME}/repo \
    --poll-interval-seconds ${POLL_INTERVAL_S}
else
  echo "Starting node"
  exec node \
    src/main.js \
    --repo-dir /var/sepal/${MODULE_NAME}/repo \
    --poll-interval-seconds ${POLL_INTERVAL_S}
fi
