#!/usr/bin/env bash

VERSION=${1:-"latest"}
GIT_COMMIT=$2
WORKSPACE=$3
ANSIBLE_WORKSPACE=$4

INVENTORY_FILE_PATH="$WORKSPACE"/hosting-services/common/operations/local_inventory

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=${WORKSPACE}/ansible.cfg

ansible-playbook ${WORKSPACE}/hosting-services/common/operations/build-and-push-images.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=/etc/sepal/certificates/aws.pem \
    --extra-vars "version=$VERSION workspace=$ANSIBLE_WORKSPACE secret_vars_file=/etc/sepal/secret.yml git_commit=$GIT_COMMIT"
