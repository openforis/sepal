#!/usr/bin/env bash

worker_user=$1

for i in {30..0}; do
    if [ $(getent passwd $worker_user | wc -l) -eq 1 ]; then
        break
    fi
    echo "Waiting for user $worker_user to be initialized..."
    /bin/sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 "User $worker_user not initialized"
    exit 1
else
    echo "User $worker_user initialized"
fi

exec sudo -Eu $worker_user "PATH=$PATH" java -jar /opt/sepal/bin/task-executor.jar /etc/task-executor.properties