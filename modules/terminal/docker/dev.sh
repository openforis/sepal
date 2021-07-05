#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9235 \
    src/main.js \
    --ip '127.0.0.1' \
    --port 8000 \
    --home-dir '/var/sepal/sepal-server/home' \
    --ssh-script-path 'ssh_gateway.sh'

# module.exports = {
#     PORT: process.env.PORT || 3000,
#     HOST: process.env.IP || '127.0.0.1',
#     USERS_HOME: process.env.USERS_HOME || '/sepalUsers',
#     SSH_SCRIPT_PATH: process.env.SSH_SCRIPT_PATH ||'ssh_gateway.sh'
# }
