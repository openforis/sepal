#!/usr/bin/env bash

PORTS=$(echo $1 | tr ";" "\n")
for PORT in $PORTS;
do
    for i in {30..0}; do
        if netstat -ntlp | grep ":$PORT"  >/dev/null 2>&1; then
    		break
    	fi
    	echo "Waiting for ${PORT}..."
    	sleep 1
    done
    if [ "$i" = 0 ]; then
        echo >&2 "port $PORT not available."
    	exit 1
    else
        echo "Port $PORT available"
    fi
done
