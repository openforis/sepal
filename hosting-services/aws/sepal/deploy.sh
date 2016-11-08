#!/usr/bin/env bash
set -e

VERSION=$1
REGION=$2
AV_ZONE=$3
ENV=$4
EFS_ID=$5
CONFIG_HOME=$6
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem

echo "Deploying Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
REGION: $REGION, \
AV_ZONE: $AV_ZONE, \
ENV: $ENV, \
EFS_ID: $EFS_ID]"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source $CONFIG_HOME/export_aws_keys.sh

../inventory/ec2.py --refresh-cache > /dev/null

ansible-playbook deploy.yml \
    -i ../inventory/ec2.py \
    --private-key=$PRIVATE_KEY \
    --extra-vars "\
            region=$REGION \
            efs_id=$EFS_ID \
            availability_zone=$AV_ZONE \
            deploy_environment=$ENV \
            version=$VERSION \
            secret_vars_file=$CONFIG_HOME/secret.yml \
            config_home=$CONFIG_HOME"
