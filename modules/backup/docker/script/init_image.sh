#!/bin/bash
echo "Initing backup image"

apt-get -y update && apt-get install -y \
 cron \
 python-pip

pip install awscli

printf '%s\n' \
    "$BACKUP_CRON_EXP root flock -xn ~/backup.lck -c /script/backup.sh" \
    >> /etc/crontab
