#!/bin/bash

sandbox_user=$1

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
 --ServerApp.password=''\
 --ServerApp.disable_check_xsrf=True\
 --ServerApp.base_url='/api/sandbox/jupyter/'\
 --ServerApp.root_dir="/home/$sandbox_user"\
 --FileContentsManager.delete_to_trash=False\
 --VoilaConfiguration.enable_nbextensions=True\
 --VoilaConfiguration.show_tracebacks=True\
 --ContentsManager.allow_hidden=True
