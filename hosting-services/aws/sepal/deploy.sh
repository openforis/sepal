#!/usr/bin/env bash
set -e

VERSION=$1
CONFIG_HOME=$2
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem

echo "Deploying Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION]"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source $CONFIG_HOME/export_aws_keys.sh

# Refresh EC2 inventory cache, to make sure provisioned instance is included
../inventory/ec2.py --refresh-cache > /dev/null

ansible-playbook deploy.yml \
    -i ../inventory/ec2.py \
    --private-key=$PRIVATE_KEY \
    --extra-vars "\
            version=$VERSION \
            secret_vars_file=$CONFIG_HOME/secret.yml \
            config_home=$CONFIG_HOME"
