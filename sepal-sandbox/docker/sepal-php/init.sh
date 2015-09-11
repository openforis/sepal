#!/bin/bash

sleep 3
mysql --host=localhost --user=root --password=Admin2015 < /schema.sql

#curl --insecure https://localhost/metacron