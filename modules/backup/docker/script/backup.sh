#!/bin/bash
bucket=$(cat ~/bucket)
dayOfWeek=$(date +%u)

if [[ $dayOfWeek -eq 1 ]] ; then
    echo "It's Monday. Copying yesterday's backup to weekly"
    aws s3 sync s3://$bucket/home/daily/ s3://$bucket/home/weekly/ --delete
    echo "Yesterday's backup copied to weekly"
fi
echo "Creating new daily user data backup"
aws s3 sync /data/sepal/home/ s3://$bucket/home/daily/ --delete
echo "Daily user data backup complete"

echo "Creating system backup"
python /script/system_backup.py $bucket $(date "+%Y-%m-%d") \
 '/data/ldap/certificates:ldap/certificates' \
 '/data/letsencrypt:letsencrypt' \
 '/data/mysql:mysql --exclude * --include *.pem' \
 '/data/ssh-gateway:ssh-gateway' \
 '/data/ssl:ssl' \
 '/data/user:user' \
 '/backup:backup'
echo "Created system backup"

rm -f /backup/ldap/* /backup/mysql/*
