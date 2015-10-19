#!/usr/bin/env bash
ansible-playbook setup.yml \
    -i ec2.py \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1"

./ec2.py --refresh-cache > /dev/null

ansible-playbook operations.yml \
    -i ec2.py \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1 secret_vars_file=~/.sepal/secret.yml skip_cache=false"
