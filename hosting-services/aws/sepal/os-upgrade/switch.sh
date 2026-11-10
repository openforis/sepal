#!/usr/bin/env bash
# OS upgrade, step 2 (the window), after prepare.sh: moves users, /data and the storage host's Redis data to the new
# hosts, points the Sandbox and Sepal-Apps security groups and the apps record at them, deploys, checks the hosts and
# lifts maintenance.
# A failed check leaves maintenance on. Run with: bin/deploy -s aws/sepal/os-upgrade/switch.sh -b <build> -c <config>
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
LOCAL_IP_ADDRESS=$(curl -s api.ipify.org)

ansible-playbook os-upgrade/switch.yml \
    -i localhost, \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "config_home=$CONFIG_HOME"

inventory=$(../inventory.sh Sepal)
for playbook in provision-sepal-apps.yml provision-security-groups.yml; do
    ansible-playbook "$playbook" \
        -i "$inventory" \
        --private-key="$PRIVATE_KEY" \
        --extra-vars "env_file=$CONFIG_HOME/env local_ip_address=$LOCAL_IP_ADDRESS"
done

./deploy.sh "$VERSION" "$CONFIG_HOME"

ansible-playbook kernel-check/hosts.yml \
    -i "$inventory" -i "$(../inventory.sh SepalStorage)" -i "$(../inventory.sh SepalApps)" \
    --private-key="$PRIVATE_KEY"

ansible-playbook os-upgrade/caddy-maintenance.yml \
    -i "$inventory" \
    --private-key="$PRIVATE_KEY" \
    --extra-vars "maintenance=off"
