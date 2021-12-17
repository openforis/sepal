#!/bin/bash

cp /data/certificates/* /container/service/slapd/assets/certs

exec /usr/bin/supervisord -c /config/supervisord.conf