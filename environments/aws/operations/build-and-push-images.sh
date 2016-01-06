#!/usr/bin/env bash

VERSION=${1:-"latest"}
CONTEXT_DIR=$2
INVENTORY_FILE_NAME=${3:-"local_inventory"}

INVENTORY_FILE_PATH="$CONTEXT_DIR"/environments/aws/operations/"$INVENTORY_FILE_NAME"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=${CONTEXT_DIR}/ansible.cfg

ansible-playbook ${CONTEXT_DIR}/environments/aws/operations/build-and-push-images.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "version=$VERSION secret_vars_file=~/.sepal/secret.yml"
