#!/bin/bash

sandbox_user=$1
sandbox_path=$2
for i in {30..0}; do
    if [ $(getent passwd $sandbox_user | wc -l) -eq 1 ]; then
        break
    fi
    echo "Waiting for user $sandbox_user to be initialized..."
    /bin/sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 "User $sandbox_user not initialized"
    exit 1
else
    echo "User $sandbox_user initialized"
fi

sandbox_user_id=`stat -c '%u' /home/$sandbox_user`
home_group_id=`stat -c '%g' /home/$sandbox_user`
mkdir -p /home/$sandbox_user/.log/shiny
chown -R $sandbox_user_id:$home_group_id /home/$sandbox_user/.log
sudo -Eu $sandbox_user "PATH=$sandbox_path" /opt/shiny-server/ext/node/bin/shiny-server /opt/shiny-server/lib/main.js