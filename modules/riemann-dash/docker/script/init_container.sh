#!/bin/bash

mkdir -p /etc/riemann
mkdir -p /etc/riemann/custom

cp /config/config.rb /etc/riemann/
cp /config/dashboard.json /etc/riemann/custom/

# cp /config/conf.d/* /etc/riemann-dash

exec riemann-dash /etc/riemann/config.rb