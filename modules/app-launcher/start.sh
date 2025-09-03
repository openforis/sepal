#!/bin/sh

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --watch "${MODULE}/src" \
    --watch "${MODULE}/config" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9231 \
    src/main.js \
    --sepal-host "$SEPAL_HOST" \
    --sepal-admin-password "$SEPAL_ADMIN_PASSWORD" \
    --gee-email "$EE_ACCOUNT" \
    --gee-key "$EE_PRIVATE_KEY" \
    --google-project-id "$GOOGLE_PROJECT_ID" \
    --gee-client-id "$GEE_CLIENT_ID" \
    --deploy-environment "$DEPLOY_ENVIRONMENT"
else
  echo "Starting node"
  exec node \
    src/main.js \
    --sepal-host "$SEPAL_HOST" \
    --sepal-admin-password "$SEPAL_ADMIN_PASSWORD" \
    --gee-email "$EE_ACCOUNT" \
    --gee-key "$EE_PRIVATE_KEY" \
    --google-project-id "$GOOGLE_PROJECT_ID" \
    --deploy-environment "$DEPLOY_ENVIRONMENT"  
fi
