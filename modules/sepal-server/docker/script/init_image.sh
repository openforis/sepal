#!/bin/bash

# Schedule a storage usage check for every user directory
chmod 500 /script/update_storage_usage.sh
printf '%s\n' \
    '* * * * * root /script/update_storage_usage.sh' \
    >> /etc/crontab
