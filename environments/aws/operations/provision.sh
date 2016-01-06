#!/usr/bin/env bash

CONTEXT_DIR=${1:-".."}
VERSION=${2:-"latest"}
INVENTORY_FILE_NAME=${3:-"ec2.py"}


#to make the provisioning script works locally. Create a symlink from ProjectRoot to /opt/sepal

INVENTORY_FILE_PATH="$CONTEXT_DIR"/inventory/"$INVENTORY_FILE_NAME"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=${CONTEXT_DIR}/ansible.cfg

ansible-playbook provision.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1"

${INVENTORY_FILE_PATH} --refresh-cache > /dev/null

ansible-playbook deploy.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1 version=$VERSION secret_vars_file=~/.sepal/secret.yml"
