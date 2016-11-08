#!/usr/bin/env bash

VERSION=${1:-"latest"}
CONTEXT_DIR=$2

INVENTORY_FILE_PATH="$CONTEXT_DIR"/hosting-services/common/operations/local_inventory

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=${CONTEXT_DIR}/ansible.cfg

ansible-playbook ${CONTEXT_DIR}/hosting-services/common/operations/build-and-push-images.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=/etc/sepal/certificates/aws.pem \
    --extra-vars "version=$VERSION secret_vars_file=/etc/sepal/secret.yml context"
