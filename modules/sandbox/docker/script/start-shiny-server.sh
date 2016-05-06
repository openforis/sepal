#!/bin/bash

sandbox_user=$1
sandbox_path=$2
for i in {30..0}; do
    if [ $(getent passwd $sandbox_user | wc -l) -eq 1 ]; then
        break
    fi
    echo "Waiting for user $sandbox_user to be initialized..."
    sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 "User $sandbox_user not initialized"
    exit 1
else
    echo "User $sandbox_user initialized"
fi

mkdir -p /home/$sandbox_user/.log/shiny/
chown -R $sandbox_user: /home/$sandbox_user/.log
sudo -Eu $sandbox_user "PATH=$sandbox_path" /opt/shiny-server/ext/node/bin/shiny-server /opt/shiny-server/lib/main.js