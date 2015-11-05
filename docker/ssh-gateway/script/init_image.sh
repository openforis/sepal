#!/usr/bin/env bash

apt-get update && apt-get install -y  supervisor openssh-server curl jq incron

chmod 700 /create_user
chmod 700 /init_container.sh
chmod 700 /copyOver.run
chmod 700 /alive.sh
chmod 555 /ssh-bootstrap


groupadd -g 9998 ${USER_GROUP}

#create ssh deamon folder
mkdir /var/run/sshd

printf '%s\n' 'Match Group sepalUsers' 'ForceCommand /ssh-bootstrap $USER $SSH_ORIGINAL_COMMAND' >> /etc/ssh/sshd_config

echo "root" > /etc/incron.allow
mkdir -p /var/spool/incron


printf '/etc/.pwd.lock IN_CLOSE /copyOver.run' >> /var/spool/incron/root


