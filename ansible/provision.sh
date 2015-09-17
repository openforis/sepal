#!/usr/bin/env bash
ansible-playbook setup.yml \
    -i ec2.py \
    --private-key=~/.ssh/sepal/eu-central-1.pem \
    --extra-vars "region=eu-central-1"

./ec2.py --refresh-cache > /dev/null

ansible-playbook configure-instances.yml \
    -i ec2.py \
    --private-key=~/.ssh/sepal/eu-central-1.pem
