#!/usr/bin/env bash
apt-get update -y && apt-get install -y \
 curl \
 cron \
 wget \
 supervisor \
 python \
 python-dev \
 python-virtualenv \
 gcc \
 dialog \
 libaugeas0 augeas-lenses \
 libssl-dev \
 libffi-dev \
 ca-certificates

apt-get install -y
curl https://get.acme.sh | sh
