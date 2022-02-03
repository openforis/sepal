#!/usr/bin/env bash

# remove locked libs
rm -rf /usr/local/lib/R/site-library/00LOCK-*

# remove cached sources
rm -rf /R/cranroot/src/contrib/*

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9239 \
    src/main.js \
    --cran-repo https://cran.r-project.org \
    --cran-root /R/cranroot \
    --lib /usr/local/lib/R/site-library \
    --redis-uri redis://r-proxy-redis \
    --auto-update-interval-hours 24
else
  echo "Starting node"
  exec node \
    src/main.js \
    --cran-repo https://cran.r-project.org \
    --cran-root /R/cranroot \
    --lib /usr/local/lib/R/site-library \
    --redis-uri redis://r-proxy-redis \
    --auto-update-interval-hours 24
fi
