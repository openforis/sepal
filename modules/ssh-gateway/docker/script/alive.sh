#!/usr/bin/env bash

password=$(cat /etc/sepalAdmin.passwd)
while true
do
    curl -H "sepal-user:{username: \"sepalAdmin\", roles: [\"application_admin\"]}" -X POST -s "http://sepal:1025/api/sandbox/$USER/session/$1"
    /bin/sleep 30
done
