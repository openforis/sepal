#!/usr/bin/env bash

password=$(cat /etc/sepalAdmin.passwd)
while true
do
    curl -u "sepalAdmin:$password" -X POST -s "http://sepal:1025/api/sandbox/$USER/session/$1"
    sleep 10
done
