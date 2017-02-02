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
cd /usr/local/lib/geo-web-viz
export core_count=$(/bin/grep -c ^processor /proc/cpuinfo)
sudo -Eu $sandbox_user "PATH=$sandbox_path" gunicorn\
 --bind 0.0.0.0:5678\
 --workers 1\
 --timeout 3600\
 --threads $(($core_count * 4))\
 --backlog 64\
 wsgi:app 5678 /home/$sandbox_user