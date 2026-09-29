#!/usr/bin/env bash
set -e

export VERSION=$1
export CONFIG_HOME=$2

# Export all in env file
set -a
source $CONFIG_HOME/env
set +a

cd "$( dirname "${BASH_SOURCE[0]}" )"

CONTENT_HASH=$(python3 worker-ami/worker_ami.py hash "$VERSION")

# Packer replaces an AMI of the same name, and the worker keeps launching from the AMI id it resolved
# at startup: rebuilding the current AMI under its own build would break every launch until a restart.
CURRENT_VERSION=$(python3 worker-ami/worker_ami.py lookup "$CONTENT_HASH")
if [ "$CURRENT_VERSION" = "$VERSION" ]; then
    echo "The worker AMI of build $VERSION is the current one for its content. Rebuild it under a newer build,"
    echo "then deploy that build so the worker switches to it."
    exit 1
fi

echo "Building worker AMI [\
VERSION: $VERSION, \
CONTENT_HASH: $CONTENT_HASH]
"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg
export AWS_MAX_ATTEMPTS=150
export AWS_POLL_DELAY_SECONDS=60

packer build \
  --var AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  --var AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  --var AWS_REGION="$AWS_REGION" \
  --var AWS_WORKER_AMI="$AWS_WORKER_AMI" \
  --var VERSION="$VERSION" \
  --var CONFIG_HOME="$CONFIG_HOME" \
  --var CONTENT_HASH="$CONTENT_HASH" \
  worker-ami/packer.json
