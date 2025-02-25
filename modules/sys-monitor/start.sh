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
    --pushover-api-key ${PUSHOVER_API_KEY} \
    --pushover-group-key ${PUSHOVER_GROUP_KEY} \
    --sepal-server-log ${SEPAL_SERVER_LOG} \
    --initial-delay-minutes ${INITIAL_DELAY_MINUTES} \
    --auto-rearm-delay-hours ${AUTO_REARM_DELAY_HOURS} \
    --notify-from ${NOTIFY_FROM} \
    --emergency-notification-retry-delay ${EMERGENCY_NOTIFICATION_RETRY_DELAY} \
    --emergency-notification-retry-timeout ${EMERGENCY_NOTIFICATION_RETRY_TIMEOUT}
else
  echo "Starting node"
  exec node \
    src/main.js \
    --pushover-api-key ${PUSHOVER_API_KEY} \
    --pushover-group-key ${PUSHOVER_GROUP_KEY} \
    --sepal-server-log ${SEPAL_SERVER_LOG} \
    --initial-delay-minutes ${INITIAL_DELAY_MINUTES} \
    --auto-rearm-delay-hours ${AUTO_REARM_DELAY_HOURS} \
    --notify-from ${NOTIFY_FROM} \
    --emergency-notification-retry-delay ${EMERGENCY_NOTIFICATION_RETRY_DELAY} \
    --emergency-notification-retry-timeout ${EMERGENCY_NOTIFICATION_RETRY_TIMEOUT}
fi
