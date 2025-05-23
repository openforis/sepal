#!/bin/bash

apt-get update -y -qq && apt-get install --allow-unauthenticated -y \
    supervisor \
    net-tools \
    gettext
