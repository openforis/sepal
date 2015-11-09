#!/usr/bin/env bash


REGION=$1
AV_ZONE=$2
ENV=$3
CONTEXT_DIR=${4:-"."}


INVENTORY_FILE="$CONTEXT_DIR"/ec2.py


ansible-playbook ${CONTEXT_DIR}/setup.yml \
    -i ${INVENTORY_FILE} \
    --private-key=~/.ssh/sepal/${REGION}.pem  \
    --extra-vars "region=eu-west-1 availability_zone=$AV_ZONE deploy_environment=$ENV"

./ec2.py --refresh-cache > /dev/null

ansible-playbook ${CONTEXT_DIR}/configure-instances.yml \
    -i ${INVENTORY_FILE} \
    --private-key=~/.ssh/sepal/${REGION}.pem \
    --extra-vars "local_php=false local_sepal=false deploy_environment=$ENV use_custom_host=false secret_vars_file=~/.sepal/secret.yml"
