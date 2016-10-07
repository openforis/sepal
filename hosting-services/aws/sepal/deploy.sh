#!/usr/bin/env bash

REGION=$1
AV_ZONE=$2
ENV=$3
VERSION=${4:-latest}
EFS_ID=$5
CONTEXT_DIR=${6:-".."}
PRIVATE_KEY=${7:-"~/.ssh/sepal/$REGION.pem"}

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=${CONTEXT_DIR}/ansible.cfg

source ~/.sepal/export_aws_keys.sh

../inventory/ec2.py --refresh-cache > /dev/null

ansible-playbook deploy.yml \
    -i ../inventory/ec2.py \
    --private-key=${PRIVATE_KEY} \
    --extra-vars "\
            region=$REGION \
            efs_id=$EFS_ID \
            availability_zone=$AV_ZONE \
            local_sepal=false \
            deploy_environment=$ENV \
            version=$VERSION \
            use_custom_host=false \
            secret_vars_file=~/.sepal/secret.yml"



