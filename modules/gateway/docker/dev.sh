#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9237 \
    src/main.js \
    --redis-uri redis://gateway-redis \
    --modules /etc/sepal/module.d/gateway/modules.json
