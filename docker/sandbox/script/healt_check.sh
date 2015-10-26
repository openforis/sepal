#!/usr/bin/env bash

PORTS=$(echo $1 | tr ";" "\n")
for PORT in $PORTS;
do
    WAITING=true
    netstat -ntlp | grep ":$PORT"  >/dev/null 2>&1 && WAITING=false
    while $WAITING;
    do
        echo "Trying again port $PORT"
        netstat -ntlp | grep ":$PORT"  >/dev/null 2>&1 && WAITING=false
    done
    echo "Port $PORT available"
done
