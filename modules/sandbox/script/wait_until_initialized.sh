#!/usr/bin/env bash

ports=$(echo $1 | tr ";" "\n")
for port in $ports;
do
    for i in {30..0}; do
        if netstat -ntlp | grep ":$port"  >/dev/null 2>&1; then
    		break
    	fi
    	echo "Waiting for ${port}..."
    	/bin/sleep 1
    done
    if [ "$i" = 0 ]; then
        echo >&2 "port $port not available"
    	exit 1
    else
        echo "Port $port available"
    fi
done

