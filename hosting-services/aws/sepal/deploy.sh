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

WORKER_AMI_HASH=$(python3 worker-ami/worker_ami.py hash "$VERSION")
WORKER_AMI_VERSION=$(python3 worker-ami/worker_ami.py lookup "$WORKER_AMI_HASH")
if [ -z "$WORKER_AMI_VERSION" ]; then
    echo "No worker AMI for build $VERSION (hash $WORKER_AMI_HASH): run provision first"
    exit 1
fi

echo "Deploying Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
WORKER_AMI_VERSION: $WORKER_AMI_VERSION]"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg
export DOCKER_VERSION=25.0.16
export DOCKER_COMPOSE_VERSION=5.5.1
export DOCKER_BUILDX_VERSION=0.37.1

ansible-playbook deploy.yml \
    -i "$(../inventory.sh Sepal)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "env_file=$CONFIG_HOME/env config_home=$CONFIG_HOME version=$VERSION worker_ami_version=$WORKER_AMI_VERSION"

# use values defined by deploy,yml
SWARM_TOKEN="$(cat /tmp/swarm-token)"
SYSLOG_ADDRESS="$(cat /tmp/syslog-address)"

ansible-playbook deploy-sepal-apps.yml \
    -i "$(../inventory.sh SepalApps)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "env_file=$CONFIG_HOME/env config_home=$CONFIG_HOME version=$VERSION swarm_token=$SWARM_TOKEN syslog_address=$SYSLOG_ADDRESS"

ansible-playbook deploy-sepal-storage.yml \
    -i "$(../inventory.sh SepalStorage)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "env_file=$CONFIG_HOME/env config_home=$CONFIG_HOME version=$VERSION swarm_token=$SWARM_TOKEN syslog_address=$SYSLOG_ADDRESS"
