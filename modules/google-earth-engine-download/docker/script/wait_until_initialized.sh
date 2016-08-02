#!/usr/bin/env bash

endpoint="http://localhost:5002/healthcheck"
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
