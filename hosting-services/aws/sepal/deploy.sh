#!/usr/bin/env bash
set -e

export VERSION=$1
export CONFIG_HOME=$2
export PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem
cd "$( dirname "${BASH_SOURCE[0]}" )"

# Export all in env file
set -a
source $CONFIG_HOME/env
set +a

echo "Deploying Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION]"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

ansible-playbook deploy.yml \
    -i "$(../inventory.sh Sepal)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "env_file=$CONFIG_HOME/env CONFIG_HOME=$CONFIG_HOME VERSION=$VERSION"

SWARM_TOKEN="$(cat /tmp/swarm-token)"

ansible-playbook deploy-sepal-apps.yml \
    -i "$(../inventory.sh SepalApps)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "env_file=$CONFIG_HOME/env CONFIG_HOME=$CONFIG_HOME VERSION=$VERSION SWARM_TOKEN=$SWARM_TOKEN"

ansible-playbook deploy-sepal-storage.yml \
    -i "$(../inventory.sh SepalStorage)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "env_file=$CONFIG_HOME/env CONFIG_HOME=$CONFIG_HOME VERSION=$VERSION SWARM_TOKEN=$SWARM_TOKEN"
