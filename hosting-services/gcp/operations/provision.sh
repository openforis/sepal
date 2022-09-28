#!/usr/bin/env bash
set -e

VERSION=$1
CONFIG_HOME=$2
REGION=eu-central-1
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem
LOCAL_IP_ADDRESS=`curl -s api.ipify.org`
cd "$( dirname "${BASH_SOURCE[0]}" )"

echo "Provisioning and deploying Ops on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
REGION: $REGION]"

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source ../export-aws-keys.sh $CONFIG_HOME/secret.yml

#ansible-playbook provision.yml \
#    -i "$(../inventory.sh Sepal "${CONFIG_HOME}")" \
#    --private-key=$PRIVATE_KEY \
#    --extra-vars "region=$REGION secret_vars_file=$CONFIG_HOME/secret.yml config_home=$CONFIG_HOME local_ip_address=$LOCAL_IP_ADDRESS"

ansible-playbook deploy.yml \
    -i "$(../inventory.sh Operations "${CONFIG_HOME}")" \
    --private-key=$PRIVATE_KEY \
    --extra-vars "region=$REGION version=$VERSION secret_vars_file=$CONFIG_HOME/secret.yml config_home=$CONFIG_HOME git_commit=nan"


#jsonConfig=$(mktemp /tmp/sepal-json-config.XXXXXX)
#python3 -c 'import sys, yaml, json; json.dump(yaml.safe_load(sys.stdin), sys.stdout, indent=4)' < $CONFIG_HOME/secret.yml > $jsonConfig
#packer build \
#    --var-file "$jsonConfig" \
#    --var "version=$VERSION"  \
#    --var "userHome=$HOME" \
#    --var "config_home=$CONFIG_HOME"\
#      packer.json
#
#rm "$jsonConfig"
