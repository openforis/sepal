#!/usr/bin/env bash
# OS upgrade, step 1, while the current hosts keep serving users: renames their tags, provisions new hosts on AWS_AMI
# beside them, and starts only Caddy on the new main host, in maintenance mode.
# Nothing else starts there: a worker on an empty database would release every running sandbox it doesn't know.
# monit stays stopped and disabled there until switch.sh deploys everything.
# Run with: bin/deploy -s aws/sepal/os-upgrade/prepare.sh -b <build> -c <config>
set -e

VERSION=$1
CONFIG_HOME=$2

set -a
source "$CONFIG_HOME/env"
set +a

cd "$( dirname "${BASH_SOURCE[0]}" )/.."
export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem

# Fails on a build without images, as provision would, before any tag is renamed
CONFIG_HOME=$CONFIG_HOME python3 worker-ami/worker_ami.py hash "$VERSION" >/dev/null

ansible-playbook os-upgrade/rename-old-hosts.yml -i localhost, --extra-vars "config_home=$CONFIG_HOME"

KEEP_SHARED_RULES=true ./provision.sh "$VERSION" "$CONFIG_HOME"

ansible-playbook os-upgrade/check-new-hosts.yml -i localhost, --extra-vars "config_home=$CONFIG_HOME"

./deploy.sh "$VERSION" "$CONFIG_HOME" caddy

ansible-playbook os-upgrade/caddy-maintenance.yml \
    -i "$(../inventory.sh Sepal)" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "maintenance=on"
