#!/usr/bin/env bash

SKIP_CACHE=${1:-false}
CONTEXT_DIR=${2:-"."}
VERSION=${3:-"latest"}
INVENTORY_FILE_NAME=${4:-"local_inventory"}

INVENTORY_FILE_PATH="$CONTEXT_DIR"/"$INVENTORY_FILE_NAME"

export ANSIBLE_HOST_KEY_CHECKING=False


ansible-playbook ${CONTEXT_DIR}/jenkins.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=~/.ssh/sepal/eu-central-1.pem
    --extra-vars "version=$VERSION secret_vars_file=~/.sepal/secret.yml skip_cache=$SKIP_CACHE"
