#!/usr/bin/env bash
set -e

VERSION=$1
REGION=$2
AV_ZONE=$3
ENV=$4
EFS_ID=$5
CONFIG_HOME=$6
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem

echo "Provisioning Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
REGION: $REGION, \
AV_ZONE: $AV_ZONE, \
ENV: $ENV, \
EFS_ID: $EFS_ID]"

INVENTORY=../inventory/ec2.py

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source $CONFIG_HOME/export_aws_keys.sh

ansible-playbook provision.yml \
    -i $INVENTORY \
    --private-key=${PRIVATE_KEY}  \
    --extra-vars "\
            region=$REGION \
            availability_zone=$AV_ZONE \
            secret_vars_file=$CONFIG_HOME/secret.yml \
            deploy_environment=$ENV"

$INVENTORY --refresh-cache > /dev/null

ansible-playbook provision-security-groups.yml \
    -i $INVENTORY \
    --private-key=${PRIVATE_KEY}  \
    --extra-vars "\
            region=$REGION \
            availability_zone=$AV_ZONE \
            secret_vars_file=$CONFIG_HOME/secret.yml \
            deploy_environment=$ENV"

ansible-playbook configure-efs.yml \
    -i $INVENTORY \
    --private-key=${PRIVATE_KEY}  \
    --extra-vars "\
            region=$REGION \
            efs_id=$EFS_ID \
            availability_zone=$AV_ZONE \
            secret_vars_file=$CONFIG_HOME/secret.yml \
            deploy_environment=$ENV"

packer build \
    --var "source_ami=ami-8ee605bd" \
    --var "region=$REGION" \
    --var "version=$VERSION"  \
    --var "userHome=$HOME" \
    --var "efs_id=$EFS_ID" \
    --var "av_zone=$AV_ZONE"  \
    --var "aws_access_key=$AWS_ACCESS_KEY_ID" \
    --var "aws_secret_key=$AWS_SECRET_ACCESS_KEY"\
    --var "config_home=$CONFIG_HOME"\
      packer.json


