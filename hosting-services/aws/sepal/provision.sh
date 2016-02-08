#!/usr/bin/env bash

REGION=$1
AV_ZONE=$2
ENV=$3
VERSION=${4:-latest}
EFS_ID=$5
PRIVATE_KEY=${6:-"~/.ssh/sepal/$REGION.pem"}

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source ~/.sepal/export_aws_keys.sh

echo "using private key $PRIVATE_KEY"

ansible-playbook provision.yml \
    -i ../inventory/ec2.py \
    --private-key=${PRIVATE_KEY}  \
    --extra-vars "region=$REGION availability_zone=$AV_ZONE deploy_environment=$ENV"

../inventory/ec2.py --refresh-cache > /dev/null

packer build \
    --var "source_ami=ami-8ee605bd" \
    --var "region=$REGION" \
    --var "version=$VERSION"  \
    --var "userHome=$HOME" \
    --var "efs_id=$EFS_ID" \
    --var "av_zone=$AV_ZONE"  \
    --var "aws_access_key=$AWS_ACCESS_KEY_ID" \
    --var "aws_secret_key=$AWS_SECRET_ACCESS_KEY"\
      packer.json


