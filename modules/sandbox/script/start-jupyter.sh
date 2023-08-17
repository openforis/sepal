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

function exportEnvironment {
    while read line; do
      export $line
    done </etc/environment
}

exportEnvironment

sudo -iu $sandbox_user PATH=$PATH PROJ_LIB=/usr/share/proj NODE_PATH=$NODE_PATH:`npm root -g`:`npm root` python3 /usr/local/bin/jupyter server \
 --no-browser\
 --allow-root\
 --ServerApp.ip=0.0.0.0\
 --ServerApp.port=8888\
 --ServerApp.token=''\
 --ServerApp.base_url='/api/sandbox/jupyter/'\
 --ServerApp.notebook_dir="/home/$sandbox_user"\
 --FileContentsManager.delete_to_trash=False\
 --VoilaConfiguration.enable_nbextensions=True\
 --VoilaConfiguration.show_tracebacks=True\
 --ContentsManager.allow_hidden=True
