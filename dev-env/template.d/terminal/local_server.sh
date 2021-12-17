#!/bin/bash
USERS_HOME=/Users \
SSH_SCRIPT_PATH=/etc/sepal/module.d/ssh_gateway.sh/ssh_gateway.sh \
SSH_GATEWAY_HOST=10.202.56.197 \
PORT=8000 \
node /usr/local/lib/sepal/modules/terminal/src/server.js
