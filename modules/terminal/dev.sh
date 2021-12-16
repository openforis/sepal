#!/usr/bin/env bash

export SSH_GATEWAY_HOST=127.0.0.1
LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9235 \
    src/main.js \
    --ip '127.0.0.1' \
    --port 8000 \
    --home-dir '/var/sepal/sepal-server/home' \
    --ssh-script-path "$PWD/script/ssh_gateway.sh"
