#!/usr/bin/env bash
venv_path=$1
requirements=$2
grep -v "^#" "$requirements" | xargs -n 1 -L 1 "$venv_path"/bin/pip3 install -U --cache-dir /root/.cache/pip
touch $venv_path/.installed
