#!/bin/bash

mysqlWaiting=true
netstat -ntlp | grep ":3306"  >/dev/null 2>&1 && mysqlWaiting=false
while $mysqlWaiting;
do
    echo "Trying again"
    netstat -ntlp | grep ":3306"  >/dev/null 2>&1 && mysqlWaiting=false
done

/opt/flyway/flyway migrate -baselineVersion=${SCHEMA_BASELINE_VERSION} -baselineOnMigrate=true -url=jdbc:mysql://mysql:3306/${MYSQL_DATABASE} -user=${MYSQL_USER} -password=${MYSQL_PASSWORD}

