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

sudo -iu $sandbox_user python3 /usr/local/bin/jupyter-notebook\
 --no-browser\
 --allow-root\
 --ip=0.0.0.0\
 --port=8888\
 --NotebookApp.token=''\
 --NotebookApp.base_url='/api/sandbox/jupyter/'\
 --NotebookApp.notebook_dir="/home/$sandbox_user"
