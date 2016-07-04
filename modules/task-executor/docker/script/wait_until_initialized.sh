#!/usr/bin/env bash

ports=$(echo $1 | tr ";" "\n")
username=$2

for i in {30..0}; do
    if [ $(getent passwd $username | wc -l) -eq 1 ]; then
        break
    fi
    echo "Waiting for user $username to be initialized..."
    sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 "User $username not initialized"
    exit 1
else
    echo "User $username initialized"
fi


for port in $ports;
do
    for i in {30..0}; do
        if netstat -ntlp | grep ":$port"  >/dev/null 2>&1; then
    		break
    	fi
    	echo "Waiting for ${port}..."
    	sleep 1
    done
    if [ "$i" = 0 ]; then
        echo >&2 "port $port not available"
    	exit 1
    else
        echo "Port $port available"
    fi
done

endpoint=http://localhost:1026/api/healthcheck
for i in {30..0}; do
    responseCode=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint")
    if [ $responseCode -eq 200 ]; then
        break
    fi
    echo "Endpoint status is $responseCode, waiting for a 200"
    sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 "Endpoint not available"
    exit 1
else
    echo "Endpoint available"
fi
