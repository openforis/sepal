#!/bin/bash
set -e

mkdir -p ~/.aws
printf '%s\n' \
    "[default]" \
    "aws_access_key_id=$AWS_ACCESS_KEY_ID" \
    "aws_secret_access_key=$AWS_SECRET_ACCESS_KEY" \
    >> ~/.aws/credentials

printf '%s\n' \
    "$S3_BACKUP_BUCKET" \
    >> ~/bucket

cron -f