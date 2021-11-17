#!/usr/bin/env bash
set -e

VERSION=$1
CONFIG_HOME=$2
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem
LOCAL_IP_ADDRESS=$(curl -s api.ipify.org)
cd "$( dirname "${BASH_SOURCE[0]}" )"

echo "Provisioning Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
LOCAL_IP_ADDRESS: $LOCAL_IP_ADDRESS]
"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg
export AWS_MAX_ATTEMPTS=150
export AWS_POLL_DELAY_SECONDS=60

source ../export-aws-keys.sh "$CONFIG_HOME"/secret.yml

inventory=$(./inventory.sh Sepal "$CONFIG_HOME")

ansible-playbook provision.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}"  \
    --extra-vars "secret_vars_file=$CONFIG_HOME/secret.yml local_ip_address=$LOCAL_IP_ADDRESS letsencrypt_aws_keys_file=$CONFIG_HOME/letsencrypt-aws-keys.yml"

ansible-playbook provision-security-groups.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}"  \
    --extra-vars "secret_vars_file=$CONFIG_HOME/secret.yml local_ip_address=$LOCAL_IP_ADDRESS"

ansible-playbook configure-efs.yml \
    -i "$inventory" \
    --private-key="${PRIVATE_KEY}"  \
    --extra-vars "secret_vars_file=$CONFIG_HOME/secret.yml"

jsonConfig=$(mktemp /tmp/sepal-json-config.XXXXXX)
python3 -c 'import sys, yaml, json; json.dump(yaml.safe_load(sys.stdin), sys.stdout, indent=4)' < "$CONFIG_HOME"/secret.yml > "$jsonConfig"
packer build \
    --var-file "$jsonConfig" \
    --var "version=$VERSION"  \
    --var "userHome=$HOME" \
    --var "config_home=$CONFIG_HOME"\
      packer.json

rm "$jsonConfig"
