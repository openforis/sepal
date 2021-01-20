#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9232 \
    src/main.js \
    --amqp-uri amqp://rabbitmq \
    --sepal-server-log /var/log/sepal/sepal-server.log \
    --notify-email-address foo@bar.baz
