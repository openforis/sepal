#!/usr/bin/env bash

password=$(cat /etc/sepalAdmin.passwd)
# Send heartbeat every 30 seconds, as long as the user has an ssh process
while ps -u $USER | grep -q " ssh$"
do
    curl -H "sepal-user:{username: \"sepalAdmin\", roles: [\"application_admin\"]}" \
         -X POST \
         -s "http://sepal:1025/api/sessions/$USER/session/$1"
    /bin/sleep 30
done
