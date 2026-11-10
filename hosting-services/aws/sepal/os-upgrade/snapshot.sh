#!/usr/bin/env bash
# OS upgrade, the day before: starts a snapshot of the main host's /data and returns without waiting for it.
# Run with: bin/deploy -s aws/sepal/os-upgrade/snapshot.sh -b <build> -c <config>
set -e

CONFIG_HOME=$2

set -a
source "$CONFIG_HOME/env"
set +a

cd "$( dirname "${BASH_SOURCE[0]}" )/.."
export ANSIBLE_CONFIG=../ansible.cfg

ansible-playbook os-upgrade/snapshot.yml -i localhost, --extra-vars "config_home=$CONFIG_HOME"
