#!/usr/bin/env bash

SKIP_CACHE=${1:-false}
CONTEXT_DIR=${2:-"."}

INVENTORY_FILE="$CONTEXT_DIR"/ec2.py

ansible-playbook ${CONTEXT_DIR}/setup.yml \
    -i ${INVENTORY_FILE} \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1"

./ec2.py --refresh-cache > /dev/null

ansible-playbook ${CONTEXT_DIR}/operations.yml \
    -i ${INVENTORY_FILE} \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1 secret_vars_file=~/.sepal/secret.yml skip_cache=$SKIP_CACHE"
