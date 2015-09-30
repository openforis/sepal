#!/usr/bin/env bash

apt-get update && apt-get install -y  supervisor openssh-server curl jq

chmod 700 /create_user
chmod 700 /init_container.sh
chmod 555 /ssh-bootstrap

groupadd ${USER_GROUP}

#create ssh deamon folder
mkdir /var/run/sshd

printf '%s\n' 'Match Group sepalUsers' 'ForceCommand /ssh-bootstrap $USER $SSH_ORIGINAL_COMMAND' >> /etc/ssh/sshd_config

