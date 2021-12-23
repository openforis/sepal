#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9239 \
    src/main.js \
    --repo-dir '/var/sepal/r-proxy/repo' \
    --poll-interval-seconds 86400
