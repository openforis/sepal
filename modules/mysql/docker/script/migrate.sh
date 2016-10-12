#!/bin/bash

mysqlWaiting=true
netstat -ntlp | grep ":3306"  >/dev/null 2>&1 && mysqlWaiting=false

for i in {50..0}; do
    if netstat -ntlp | grep ":3306"  >/dev/null 2>&1; then
		break
	fi
	echo 'Waiting for mysql...'
	sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 'MySQL init process failed.'
	exit 1
fi

/opt/flyway/flyway migrate \
    -url=jdbc:mysql://${INSTANCE_HOSTNAME}:3306/${MYSQL_DATABASE} \
    -user=root \
    -password=${MYSQL_ROOT_PASSWORD}

touch /data/module_initialized
echo "MySQL container initialized"