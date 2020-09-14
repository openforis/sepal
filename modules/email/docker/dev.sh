#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9230 \
    src/main.js \
    --amqp-uri amqp://rabbitmq \
    --redis-uri redis://email-redis \
    --smtp-host=smtp.ethereal.email \
    --smtp-port=587 \
    --smtp-user=derrick.goodwin@ethereal.email \
    --smtp-password=DFVFth6hNJ5Y7c1mjt \
    --smtp-from=samplefrom@sepal.io
