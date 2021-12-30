#!/usr/bin/env bash

# remove locked libs
# rm -rf /usr/local/lib/R/site-library/00LOCK-*

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  exec nodemon \
    --watch "${MODULE}"/src \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9239 \
    src/main.js \
    --cran-repo https://cran.r-project.org \
    --cran-root /R/cranroot \
    --lib /usr/local/lib/R/site-library \
    --redis-uri redis://r-proxy-redis
else
  echo "Starting node"
  exec node \
    src/main.js \
    --cran-repo https://cran.r-project.org \
    --cran-root /R/cranroot \
    --lib /usr/local/lib/R/site-library \
    --redis-uri redis://r-proxy-redis
fi
