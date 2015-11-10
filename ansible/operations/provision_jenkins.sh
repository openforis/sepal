#!/usr/bin/env bash

SKIP_CACHE=${1:-false}
CONTEXT_DIR=${2:-"."}
VERSION=${3:-"latest"}
INVENTORY_FILE_NAME=${4:-"local_inventory"}




ansible-playbook ${CONTEXT_DIR}/jenkins.yml \
    -i ${INVENTORY_FILE_PATH} \
    --extra-vars "version=$VERSION secret_vars_file=~/.sepal/secret.yml skip_cache=$SKIP_CACHE"
