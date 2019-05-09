#!/usr/bin/env bash
USERNAME=$1
KEY_FILE=$2
TMP_KEY_FILE=$3
sudo cp ${KEY_FILE} ${TMP_KEY_FILE}
sudo chown node:node ${TMP_KEY_FILE}

exec ssh -t -q -o StrictHostKeyChecking=no -i ${TMP_KEY_FILE} ${USERNAME}@${SSH_GATEWAY_HOST}
