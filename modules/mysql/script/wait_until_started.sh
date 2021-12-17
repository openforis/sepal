#!/bin/bash

mysqlWaiting=true
netstat -ntlp | grep ":3306"  >/dev/null 2>&1 && mysqlWaiting=false

for i in {50..0}; do
    if netstat -ntlp | grep ":3306"  >/dev/null 2>&1; then
		break
	fi
	echo 'Waiting for MySQL on port 3306...'
	/bin/sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 'MySQL not starting'
	exit 1
fi

touch /data/module_initialized
echo "MySQL started"