#!/usr/bin/env bash

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9233 \
    src/main.js \
    --amqp-uri amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT} \
    --sepal-server-log ${SEPAL_SERVER_LOG} \
    --initial-delay-minutes ${INITIAL_DELAY_MINUTES} \
    --auto-rearm-delay-hours ${AUTO_REARM_DELAY_HOURS} \
    --notify-to ${SEPAL_MONITORING_EMAIL} \
    --notify-from sys-monitor
else
  echo "Starting node"
  exec node \
    src/main.js \
    --amqp-uri amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT} \
    --sepal-server-log ${SEPAL_SERVER_LOG} \
    --initial-delay-minutes ${INITIAL_DELAY_MINUTES} \
    --auto-rearm-delay-hours ${AUTO_REARM_DELAY_HOURS} \
    --notify-to ${SEPAL_MONITORING_EMAIL} \
    --notify-from sys-monitor
fi
