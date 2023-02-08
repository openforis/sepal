#!/usr/bin/env bash

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --config ../../dev-env/nodemon/nodemon.json \
    --watch "${MODULE}"/src \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9231 \
    src/main.js \
    --amqp-uri "amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT}" \
    --redis-uri "redis://email-redis" \
    --smtp-host "${SMTP_HOST}" \
    --smtp-port "${SMTP_PORT}" \
    --smtp-secure "${SMTP_SECURE}" \
    --smtp-user "${SMTP_USERNAME}" \
    --smtp-password "${SMTP_PASSWORD}" \
    --smtp-from-domain "${SMTP_FROM_DOMAIN}" \
    --sepal-host "${SEPAL_HOST}" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD"
else
  echo "Starting node"
  exec node \
    src/main.js \
    --amqp-uri "amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT}" \
    --redis-uri "redis://email-redis" \
    --smtp-host "${SMTP_HOST}" \
    --smtp-port "${SMTP_PORT}" \
    --smtp-secure "${SMTP_SECURE}" \
    --smtp-user "${SMTP_USERNAME}" \
    --smtp-password "${SMTP_PASSWORD}" \
    --smtp-from-domain "${SMTP_FROM_DOMAIN}" \
    --sepal-host "${SEPAL_HOST}" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD"
fi
