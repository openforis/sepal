#!/bin/sh

# Docker creates a missing bind-mount source owned by root; the service runs as node.
chown node:node "${CSV_DIR}"

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || su-exec node npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec su-exec node nodemon \
    --watch "${MODULE}"/src \
    --watch "${MODULE}/config" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9229 \
    src/main.js
else
  echo "Starting node"
  exec su-exec node node src/main.js
fi
