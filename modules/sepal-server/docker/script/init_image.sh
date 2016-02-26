#!/bin/bash

chmod 500 /script/update_storage_usage.sh

# Schedule a storage usage check for every user directory
printf '%s\n' \
    '* * * * * root /script/update_storage_usage.sh' \
    >> /etc/crontab
