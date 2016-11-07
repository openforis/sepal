#!/bin/bash

mkdir -p /etc/riemann

cp /config/riemann.config /etc/riemann/riemann.config
cp /config/conf.d/* /etc/riemann/conf.d

exec /usr/bin/riemann start