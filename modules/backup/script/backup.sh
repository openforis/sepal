#!/bin/bash
bucket=$(cat ~/bucket)

echo "Creating system backup"
python3 /script/system_backup.py $bucket $(date "+%Y-%m-%d") \
 '/data/caddy/data:caddy/data' \
 '/data/mysql:mysql --exclude * --include *.pem' \
 '/data/ssh-gateway:ssh-gateway' \
 '/data/user:user' \
 '/backup:backup'
echo "Created system backup"

rm -f /backup/mysql/*
