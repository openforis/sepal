#!/usr/bin/env bash
set -e

VERSION=$1
CONFIG_HOME=$2
REGION=eu-central-1
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem
LOCAL_IP_ADDRESS=`curl -s api.ipify.org`
cd "$( dirname "${BASH_SOURCE[0]}" )"

# Export all in env file
set -a
source $CONFIG_HOME/env
set +a

echo "Provisioning and deploying Ops on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
REGION: $REGION]"

export AWS_REGION=${REGION}
export DEPLOY_ENVIRONMENT="OPS"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source ../export-aws-keys.sh $CONFIG_HOME/secret.yml

ansible-playbook provision.yml \
   -i "$(../inventory.sh Sepal "${CONFIG_HOME}")" \
   --private-key=$PRIVATE_KEY \
   --extra-vars "region=$REGION secret_vars_file=$CONFIG_HOME/secret.yml config_home=$CONFIG_HOME local_ip_address=$LOCAL_IP_ADDRESS"

ansible-playbook deploy.yml \
    -i "$(../inventory.sh Operations)" \
    --private-key=$PRIVATE_KEY \
    --extra-vars "env_file=$CONFIG_HOME/env CONFIG_HOME=$CONFIG_HOME VERSION=$VERSION git_commit=nan"
