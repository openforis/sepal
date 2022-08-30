#!/usr/bin/env bash
set -e

yum update -y && yum install -y \
    supervisor \
    net-tools \
    wget \
    procps

mkdir -p /home/mysql

# append to my.cnf for logging:
printf '%s\n' \
    '[mysqld]' \
    'explicit_defaults_for_timestamp' \
    'log-error = /var/log/mysql/error.log' \
    'long_query_time = 1' \
    'slow_query_log = 1' \
    'slow_query_log_file = /var/log/mysql/slow-queries.log' \
    'max_allowed_packet=128M' \
    >> /etc/mysql/my.cnf
