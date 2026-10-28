#!/usr/bin/env bash
set -e

export VERSION=$1
export CONFIG_HOME=$2
export PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem
export LOCAL_IP_ADDRESS=$(curl -s api.ipify.org)

# Export all in env file
set -a
source $CONFIG_HOME/env
set +a

cd "$( dirname "${BASH_SOURCE[0]}" )"

# Resolved before any playbook runs, so a missing image or unreachable registry touches no host
WORKER_AMI_HASH=$(python3 worker-ami/worker_ami.py hash "$VERSION")

echo "Provisioning Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
LOCAL_IP_ADDRESS: $LOCAL_IP_ADDRESS]
"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg
export AWS_MAX_ATTEMPTS=150
export AWS_POLL_DELAY_SECONDS=60

inventory=$(../inventory.sh Sepal)

ansible-playbook provision-common.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}" \
    --extra-vars "env_file=$CONFIG_HOME/env local_ip_address=$LOCAL_IP_ADDRESS"

ansible-playbook provision-sepal.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}" \
    --extra-vars "env_file=$CONFIG_HOME/env local_ip_address=$LOCAL_IP_ADDRESS"

ansible-playbook provision-sepal-storage.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}" \
    --extra-vars "env_file=$CONFIG_HOME/env local_ip_address=$LOCAL_IP_ADDRESS"

ansible-playbook provision-sepal-apps.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}" \
    --extra-vars "env_file=$CONFIG_HOME/env local_ip_address=$LOCAL_IP_ADDRESS"

ansible-playbook provision-security-groups.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}" \
    --extra-vars "env_file=$CONFIG_HOME/env local_ip_address=$LOCAL_IP_ADDRESS"

ansible-playbook mount-ebs.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}" \
    --extra-vars "env_file=$CONFIG_HOME/env"
    
ansible-playbook configure-efs.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}" \
    --extra-vars "env_file=$CONFIG_HOME/env"


WORKER_AMI_VERSION=$(python3 worker-ami/worker_ami.py lookup "$WORKER_AMI_HASH")
if [ -z "$WORKER_AMI_VERSION" ]; then
    ./build-worker-ami.sh "$VERSION" "$CONFIG_HOME"
else
    echo "Reusing worker AMI $WORKER_AMI_VERSION (hash $WORKER_AMI_HASH)"
fi
