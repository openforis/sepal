#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9238 \
    src/main.js \
    --home-dir '/var/sepal/sepal-server/home' \
    --poll-interval-milliseconds 1000
