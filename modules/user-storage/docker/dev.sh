#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9230 \
    src/main.js \
    --amqp-uri amqp://rabbitmq \
    --redis-uri redis://user-storage-redis \
    --home-dir /var/sepal/sepal-server/home \
    --min-delay-seconds 5 \
    --max-delay-seconds 86400 \
    --delay-increase-factor 2 \
    --concurrency 5 \
    --max-retries 3 \
    --initial-retry-delay-seconds 5

