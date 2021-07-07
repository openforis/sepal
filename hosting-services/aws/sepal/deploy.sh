#!/usr/bin/env bash
set -e

VERSION=$1
CONFIG_HOME=$2
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem
cd "$( dirname "${BASH_SOURCE[0]}" )"

echo "Deploying Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION]"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source ../export-aws-keys.sh "$CONFIG_HOME"/secret.yml

ansible-playbook deploy.yml \
    -i "$(./inventory.sh Sepal "${CONFIG_HOME}")" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "version=$VERSION secret_vars_file=$CONFIG_HOME/secret.yml config_home=$CONFIG_HOME"

ansible-playbook deploy-sepal-storage.yml \
    -i "$(./inventory.sh SepalStorage "${CONFIG_HOME}")" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "version=$VERSION secret_vars_file=$CONFIG_HOME/secret.yml config_home=$CONFIG_HOME"
