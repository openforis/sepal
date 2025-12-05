#!/bin/sh
sudo /usr/local/bin/fix_sepal_users_permissions

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
    --amqp-uri amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT} \
    --redis-host user-storage-redis \
    --home-dir /sepalUsers \
    --scan-min-delay-seconds ${SCAN_MIN_DELAY_SECONDS} \
    --scan-max-delay-seconds ${SCAN_MAX_DELAY_SECONDS} \
    --scan-delay-increase-factor ${SCAN_DELAY_INCREASE_FACTOR} \
    --scan-concurrency ${SCAN_CONCURRENCY} \
    --scan-max-retries ${SCAN_MAX_RETRIES} \
    --scan-initial-retry-delay-seconds ${SCAN_INITIAL_RETRY_DELAY_SECONDS} \
    --sepal-host "${SEPAL_HOST}" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD"
else
  echo "Starting node"
  exec node \
    src/main.js \
    --amqp-uri amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT} \
    --redis-host user-storage-redis \
    --home-dir /sepalUsers \
    --scan-min-delay-seconds ${SCAN_MIN_DELAY_SECONDS} \
    --scan-max-delay-seconds ${SCAN_MAX_DELAY_SECONDS} \
    --scan-delay-increase-factor ${SCAN_DELAY_INCREASE_FACTOR} \
    --scan-concurrency ${SCAN_CONCURRENCY} \
    --scan-max-retries ${SCAN_MAX_RETRIES} \
    --scan-initial-retry-delay-seconds ${SCAN_INITIAL_RETRY_DELAY_SECONDS} \
    --sepal-host "${SEPAL_HOST}" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD"
fi
