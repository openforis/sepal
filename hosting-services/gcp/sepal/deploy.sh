#!/usr/bin/env bash
set -e

export VERSION=$1
export CONFIG_HOME=$2
export PRIVATE_KEY=$CONFIG_HOME/instance_key
cd "$( dirname "${BASH_SOURCE[0]}" )"

# Export all in env file
set -a
source $CONFIG_HOME/env
set +a

echo "Deploying Sepal on GCP [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION]"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

ansible-playbook deploy.yml \
    -i "$(../inventory.sh sepal)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "env_file=$CONFIG_HOME/env CONFIG_HOME=$CONFIG_HOME VERSION=$VERSION"

# ansible-playbook deploy-sepal-storage.yml \
#     -i "$(../inventory.sh sepal-storage)" \
#     --private-key="$PRIVATE_KEY" \
#     --extra-vars "env_file=$CONFIG_HOME/env CONFIG_HOME=$CONFIG_HOME VERSION=$VERSION"
