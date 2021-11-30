#!/usr/bin/env bash

LIBS=../../../lib/js
NODE_TLS_REJECT_UNAUTHORIZED=0 nodemon \
    --watch src \
    --watch $LIBS/shared \
    --inspect=0.0.0.0:9232 \
    src/main.js \
    --google-analytics-id "$GOOGLE_ANALYTICS_ID" \
    --google-maps-api-key "$GOOGLE_MAPS_API_KEY" \
