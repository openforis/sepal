#!/usr/bin/env bash
set -e

export VERSION=$1
export CONFIG_HOME=$2
# Optional: deploy only these main host modules, leave monit stopped and skip the apps and storage hosts
ONLY_MODULES=("${@:3}")
export PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem
cd "$( dirname "${BASH_SOURCE[0]}" )"
export AWS_COMMON=$(realpath -m "${AWS_COMMON:-$CONFIG_HOME/../aws-common}")

# Export all in the environment's env file, and in the aws-common/env all environments share
set -a
source $CONFIG_HOME/env
source $AWS_COMMON/env
set +a

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

# Before anything changes, on every host. The inventory template takes the Type tags as a YAML list. YAML results
# keep the package list readable.
ANSIBLE_CALLBACK_RESULT_FORMAT=yaml ANSIBLE_CALLBACK_FORMAT_PRETTY=true ansible-playbook amazon-linux-release.yml \
    -i "$(../inventory.sh '[Sepal, SepalApps, SepalStorage]')" \
    --private-key="$PRIVATE_KEY"

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

export DOCKER_VERSION=
export DOCKER_COMPOSE_VERSION=5.5.1
export DOCKER_BUILDX_VERSION=0.37.1

SUBSET_VARS=()
if [ ${#ONLY_MODULES[@]} -gt 0 ]; then
    MODULES_JSON=$(printf '{"module":"%s"},' "${ONLY_MODULES[@]}")
    SUBSET_VARS=(--extra-vars "{\"modules\":[${MODULES_JSON%,}],\"images\":[],\"start_monit\":false}")
fi

ansible-playbook deploy.yml \
    -i "$(../inventory.sh Sepal)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "env_file=$CONFIG_HOME/env config_home=$CONFIG_HOME version=$VERSION worker_ami_version=$WORKER_AMI_VERSION" \
    "${SUBSET_VARS[@]}"

if [ ${#ONLY_MODULES[@]} -gt 0 ]; then
    exit 0
fi

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
