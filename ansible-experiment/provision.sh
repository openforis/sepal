#!/usr/bin/env bash
ansible-playbook setup.yml \
    -i ec2.py \
    --private-key=/Users/wiell/.ssh/test_key_pair.pem \
    --extra-vars "ami_id=ami-dfba9ea8 region=eu-west-1"

./ec2.py --refresh-cache > /dev/null

ansible-playbook configure-instances.yml \
    -i ec2.py \
    --private-key=/Users/wiell/.ssh/test_key_pair.pem
