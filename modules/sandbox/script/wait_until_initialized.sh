#!/usr/bin/env bash

ports=$(echo $1 | tr ";" "\n")
for port in $ports;
do
    available=false
    for _ in {1..30}; do
        if netstat -ntlp | grep ":$port" >/dev/null 2>&1; then
            available=true
            break
        fi
        echo "Waiting for ${port}..."
        /bin/sleep 1
    done
    if ! $available && netstat -ntlp | grep ":$port" >/dev/null 2>&1; then
        available=true
    fi
    if $available; then
        echo "Port $port available"
    else
        echo >&2 "port $port not available"
        exit 1
    fi
done

