#!/usr/bin/env bash

CONTEXT_DIR=${1:-"."}

INVENTORY_FILE="$CONTEXT_DIR"/ec2.py


ansible-playbook ${CONTEXT_DIR}/setup.yml \
    -i ${INVENTORY_FILE} \
    --private-key=~/.ssh/sepal/eu-west-1.pem  \
    --extra-vars "region=eu-west-1 availability_zone=eu-west-1a deploy_environment=Development"

./ec2.py --refresh-cache > /dev/null

ansible-playbook ${CONTEXT_DIR}/configure-instances.yml \
    -i ${INVENTORY_FILE} \
    --private-key=~/.ssh/sepal/eu-west-1.pem \
    --extra-vars "deploy_environment=Development use_custom_host=false secret_vars_file=~/.sepal/secret.yml"
