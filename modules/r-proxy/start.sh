#!/usr/bin/env bash

# remove locked libs
find /usr/local/lib/R/site-library/ -name "00LOCK-*" -print0 | xargs -0 rm -rf

# remove cached CRAN sources
find /R -type f -path */cranroot/src/* -print0 | xargs -0 rm

# remove cached GitHub sources
find /R -maxdepth 4 -type d -path */github/src/* -print0 | xargs -0 rm -r

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
    --os-release "${NAME}-${VERSION_ID}" \
    --cran-repo https://cran.r-project.org \
    --repo-path /R \
    --lib-path /usr/local/lib/R/site-library \
    --redis-uri redis://r-proxy-redis \
    --auto-update-interval-hours 24
    # --update-now
else
  echo "Starting node"
  exec node \
    src/main.js \
    --os-release "${NAME}-${VERSION_ID}" \
    --cran-repo https://cran.r-project.org \
    --repo-path /R \
    --lib-path /usr/local/lib/R/site-library \
    --redis-uri redis://r-proxy-redis \
    --auto-update-interval-hours 24
fi
