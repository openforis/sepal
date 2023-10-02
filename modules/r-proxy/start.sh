#!/usr/bin/env bash

# remove locked libs
rm -rf /usr/local/lib/R/site-library/00LOCK-*

# remove cached sources
rm -rf /R/cranroot/src/contrib/*

source /etc/os-release

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${MODULE}/config" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9239 \
    src/main.js \
    --os-release "${PRETTY_NAME}" \
    --cran-repo https://cran.r-project.org \
    --repo-path /R \
    --lib-path /usr/local/lib/R/site-library \
    --redis-uri redis://r-proxy-redis \
    --auto-update-interval-hours 24
else
  echo "Starting node"
  exec node \
    src/main.js \
    --os-release "${PRETTY_NAME}" \
    --cran-repo https://cran.r-project.org \
    --repo-path /R \
    --lib-path /usr/local/lib/R/site-library \
    --redis-uri redis://r-proxy-redis \
    --auto-update-interval-hours 24
fi
