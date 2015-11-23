#!/usr/bin/env bash

CONTEXT_DIR=${1:-"../.."}
VERSION=${2:-"latest"}
INVENTORY_FILE_NAME=${3:-"ec2.py"}


INVENTORY_FILE_PATH="$CONTEXT_DIR"/operations/inventory/"$INVENTORY_FILE_NAME"

export ANSIBLE_CONFIG=${CONTEXT_DIR}/ansible_local.cfg

ansible-playbook ${CONTEXT_DIR}/operations/setup.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1"

${INVENTORY_FILE_PATH} --refresh-cache > /dev/null

ansible-playbook ${CONTEXT_DIR}/operations/operations.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1 version=$VERSION secret_vars_file=~/.sepal/secret.yml"
