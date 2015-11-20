#!/usr/bin/env bash


REGION=$1
AV_ZONE=$2
ENV=$3
CONTEXT_DIR=${4:-"."}
VERSION=${5:-latest}
INVENTORY_FILE=${6:-"ec2.py"}
PRIVATE_KEY=${7:-"~/.ssh/sepal/$REGION.pem"}


INVENTORY_FILE_PATH="$CONTEXT_DIR/$INVENTORY_FILE"

echo "using inventory file $INVENTORY_FILE_PATH"
echo "using private key $PRIVATE_KEY"

ansible-playbook ${CONTEXT_DIR}/setup.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=${PRIVATE_KEY}  \
    --extra-vars "region=$REGION availability_zone=$AV_ZONE deploy_environment=$ENV"

${INVENTORY_FILE_PATH} --refresh-cache > /dev/null

ansible-playbook ${CONTEXT_DIR}/configure-instances.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=${PRIVATE_KEY} \
    --extra-vars " region=$REGION availability_zone=$AV_ZONE local_php=false local_sepal=false deploy_environment=$ENV version=$VERSION use_custom_host=false secret_vars_file=~/.sepal/secret.yml"