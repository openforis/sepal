#!/usr/bin/env bash


CONTEXT_DIR=${1:-".."}
VERSION=${2:-"latest"}
INVENTORY_FILE_NAME=${3:-"inventory/local_inventory"}

INVENTORY_FILE_PATH="$CONTEXT_DIR"/"$INVENTORY_FILE_NAME"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=${CONTEXT_DIR}/ansible.cfg


ansible-playbook ${CONTEXT_DIR}/jenkins.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "version=$VERSION secret_vars_file=~/.sepal/secret.yml"
