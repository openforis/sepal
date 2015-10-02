#!/bin/bash

sleep 3
mysql --host=mysql --user=$MYSQL_USER --password="$MYSQL_PASSWORD" --database="$MYSQL_DATABASE" < /schema.sql
mysql --host=mysql --user=$MYSQL_USER --password="$MYSQL_PASSWORD" --database="$MYSQL_DATABASE" < /wrs_points.sql

