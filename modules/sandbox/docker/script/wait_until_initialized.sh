#!/usr/bin/env bash

porst=$(echo $1 | tr ";" "\n")
username=$2
for port in $porst;
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
done
