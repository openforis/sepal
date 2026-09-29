#!/bin/bash

sandbox_user=$1
sandbox_path=$2

sandbox_user_id=`stat -c '%u' /home/$sandbox_user`
home_group_id=`stat -c '%g' /home/$sandbox_user`
mkdir -p /home/$sandbox_user/.log/shiny
chown -R $sandbox_user_id:$home_group_id /home/$sandbox_user/.log
sudo -Eu $sandbox_user "PATH=$sandbox_path" /opt/shiny-server/ext/node/bin/shiny-server /opt/shiny-server/lib/main.js