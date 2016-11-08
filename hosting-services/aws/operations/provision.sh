#!/usr/bin/env bash
set -e

VERSION=$1
REGION=$2
CONFIG_HOME=$3
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem

echo "Provisioning and deploying Ops on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
REGION: $REGION]"

INVENTORY_FILE_PATH=../inventory/ec2.py

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source $CONFIG_HOME/export_aws_keys.sh

ansible-playbook provision.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=$PRIVATE_KEY \
    --extra-vars "\
            region=$REGION \
            secret_vars_file=$CONFIG_HOME/secret.yml \
            config_home=$CONFIG_HOME"

${INVENTORY_FILE_PATH} --refresh-cache > /dev/null

ansible-playbook deploy.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=$PRIVATE_KEY \
    --extra-vars "\
            region=$REGION \
            version=$VERSION \
            secret_vars_file=$CONFIG_HOME/secret.yml \
            config_home=$CONFIG_HOME"

