#!/bin/bash

mysqlWaiting=true
netstat -ntlp | grep ":3306"  >/dev/null 2>&1 && mysqlWaiting=false
while $mysqlWaiting;
do
    echo "Trying again"
    netstat -ntlp | grep ":3306"  >/dev/null 2>&1 && mysqlWaiting=false
done
mysql --host=mysql --user=$MYSQL_USER --password="$MYSQL_PASSWORD" --database="$MYSQL_DATABASE" < /schema.sql
mysql --host=mysql --user=$MYSQL_USER --password="$MYSQL_PASSWORD" --database="$MYSQL_DATABASE" < /wrs_points.sql

