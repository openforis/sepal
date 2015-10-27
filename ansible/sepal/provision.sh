#!/usr/bin/env bash
ansible-playbook ./setup.yml \
    -i ./ec2.py \
    --private-key=~/.ssh/sepal/eu-west-1.pem  \
    --extra-vars "region=eu-west-1 availability_zone=eu-west-1a deploy_environment=Development"

./ec2.py --refresh-cache > /dev/null

ansible-playbook ./configure-instances.yml \
    -i ./ec2.py \
    --private-key=~/.ssh/sepal/eu-west-1.pem \
    --extra-vars "deploy_environment=Development use_custom_host=false secret_vars_file=~/.sepal/secret.yml"
