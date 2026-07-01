#!/bin/bash

function template {
    local template=$1
    local destination=$2
    local owner=$3
    local mode=$4
    envsubst < $template > $destination
    chown $owner $destination
    chmod $mode $destination
}

mkdir -p /var/run/sshd

template /config/sepalAdmin.passwd /etc/sepalAdmin.passwd root: 0644

# Keep /etc/ssh in a mounted volume, so host keys are reused between upgrades
if [ ! -d /data/ssh ]; then
    mkdir /data/ssh
    cp -rf /etc/ssh/* /data/ssh
fi
rm -rf /etc/ssh-backup
mv /etc/ssh /etc/ssh-backup
ln -sf /data/ssh /etc/ssh

# Refresh build-time config from the image on every start (host keys stay persisted in /data/ssh).
# Without this, an existing install keeps a stale sshd_config from a previous image — e.g. the old
# sss_ssh_authorizedkeys AuthorizedKeysCommand — and never picks up image config changes.
for config_file in /etc/ssh-backup/*; do
    case "$(basename "$config_file")" in
        ssh_host_*) ;; # preserve persisted host keys
        *) cp -rf "$config_file" /data/ssh/ ;;
    esac
done

exec /usr/bin/supervisord -c /config/supervisord.conf
