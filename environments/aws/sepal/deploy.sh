#!/usr/bin/env bash

REGION=$1
EFS_ID=$2
AV_ZONE=$3
ENV=$4
VERSION=${5:-latest}
CONTEXT_DIR=${6:-".."}
PRIVATE_KEY=${7:-"~/.ssh/sepal/$REGION.pem"}

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=${CONTEXT_DIR}/ansible.cfg

ansible-playbook deploy.yml \
    -i ../inventory/ec2.py \
    --private-key=${PRIVATE_KEY} \
    --extra-vars "\
            region=$REGION \
            efs_id=$EFS_ID \
            availability_zone=$AV_ZONE \
            local_php=false \
            local_sepal=false \
            deploy_environment=$ENV \
            version=$VERSION \
            use_custom_host=false \
            secret_vars_file=~/.sepal/secret.yml"



