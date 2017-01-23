#!/bin/bash
# Test AWS provisiones with Ansible

echo "Starting VM and provision with role"
vagrant box update
vagrant destroy -f
vagrant up

ansible-playbook -i .vagrant/provisioners/ansible/inventory tests/playbooks.yml