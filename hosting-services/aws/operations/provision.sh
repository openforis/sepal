#!/usr/bin/env bash
set -e

VERSION=$1
CONFIG_HOME=$2
#VERSION=$1
#REGION=$2
#CONFIG_HOME=$3
PRIVATE_KEY=$CONFIG_HOME/certificates/aws.pem
LOCAL_IP_ADDRESS=`curl -s api.ipify.org`
cd "$( dirname "${BASH_SOURCE[0]}" )"

echo "Provisioning and deploying Ops on AWS [\
CONFIG_HOME: $CONFIG_HOME, \
VERSION: $VERSION, \
REGION: $REGION]"

INVENTORY_FILE_PATH=../inventory/ec2.py

export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_CONFIG=../ansible.cfg

source ../export-aws-keys.sh $CONFIG_HOME/secret.yml

ansible-playbook provision.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=$PRIVATE_KEY \
    --extra-vars "region=$REGION secret_vars_file=$CONFIG_HOME/secret.yml config_home=$CONFIG_HOME local_ip_address=$LOCAL_IP_ADDRESS"

${INVENTORY_FILE_PATH} --refresh-cache > /dev/null

ansible-playbook deploy.yml \
    -i ${INVENTORY_FILE_PATH} \
    --private-key=$PRIVATE_KEY \
    --extra-vars "region=$REGION version=$VERSION secret_vars_file=$CONFIG_HOME/secret.yml config_home=$CONFIG_HOME"


#jsonConfig=$(mktemp /tmp/sepal-json-config.XXXXXX)
#python3 -c 'import sys, yaml, json; json.dump(yaml.load(sys.stdin), sys.stdout, indent=4)' < $CONFIG_HOME/secret.yml > $jsonConfig
#packer build \
#    --var-file "$jsonConfig" \
#    --var "version=$VERSION"  \
#    --var "userHome=$HOME" \
#    --var "config_home=$CONFIG_HOME"\
#      packer.json
#
#rm "$jsonConfig"
