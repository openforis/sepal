#!/usr/bin/env bash
set -e

VERSION=$1
CONFIG_HOME=$2
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem

echo "Provisioning Sepal on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION]"

INVENTORY=../inventory/ec2.py
export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source $CONFIG_HOME/export_aws_keys.sh

ansible-playbook provision.yml \
    -i $INVENTORY \
    --private-key=${PRIVATE_KEY}  \
    --extra-vars "secret_vars_file=$CONFIG_HOME/secret.yml"

# Refresh EC2 inventory cache, to make sure provisioned instance is included
$INVENTORY --refresh-cache > /dev/null

ansible-playbook provision-security-groups.yml \
    -i $INVENTORY \
    --private-key=${PRIVATE_KEY}  \
    --extra-vars "secret_vars_file=$CONFIG_HOME/secret.yml"

ansible-playbook configure-efs.yml \
    -i $INVENTORY \
    --private-key=${PRIVATE_KEY}  \
    --extra-vars "secret_vars_file=$CONFIG_HOME/secret.yml"

jsonConfig=$(mktemp /tmp/sepal-json-config.XXXXXX)
python -c 'import sys, yaml, json; json.dump(yaml.load(sys.stdin), sys.stdout, indent=4)' < $CONFIG_HOME/secret.yml > $jsonConfig
packer build \
    --var-file "$jsonConfig" \
    --var "version=$VERSION"  \
    --var "userHome=$HOME" \
    --var "config_home=$CONFIG_HOME"\
      packer.json

rm "$jsonConfig"