#!/usr/bin/env bash
# Runs one kernel-check playbook with a deployment's environment.
# Usage: run.sh <playbook> "<host Type tags to inventory>" <version> <config home>
set -e

PLAYBOOK=$1
TYPES=$2
CONFIG_HOME=$4

set -a
source "$CONFIG_HOME/env"
set +a

# inventory.sh resolves its template against the working directory
cd "$( dirname "${BASH_SOURCE[0]}" )/.."

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

INVENTORIES=()
for TYPE in $TYPES; do
    INVENTORIES+=(-i "$(../inventory.sh "$TYPE")")
done

ansible-playbook "kernel-check/$PLAYBOOK" \
    "${INVENTORIES[@]}" \
    --private-key="$CONFIG_HOME/certificates/aws.pem" \
    --extra-vars "config_home=$CONFIG_HOME"
