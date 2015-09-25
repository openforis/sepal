#!/bin/bash

sleep 3
mysql --host=mysql --user=$MYSQL_USER --password="$MYSQL_PASSWORD" < /schema.sql
mysql --host=mysql --user=$MYSQL_USER --password="$MYSQL_PASSWORD" < /wrs_points.sql

