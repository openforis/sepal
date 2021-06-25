#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9232 \
    src/main.js \
    --amqp-uri amqp://rabbitmq \
    --sepal-server-log /var/log/sepal/sepal-server.log \
    --initial-delay-minutes 1 \
    --auto-rearm-delay-hours 1 \
    --notify-to foo@bar.baz \
    --notify-from sys-monitor
