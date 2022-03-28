#!/usr/bin/env bash
venv_path=$1
requirements=$2
"$venv_path"/bin/pip3 install -r "$requirements" -U --cache-dir /root/.cache/pip
touch $venv_path/../.installed
