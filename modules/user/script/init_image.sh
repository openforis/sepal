#!/usr/bin/env bash

apt-get -y update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    curl \
    jq \
    ldapscripts \
    openssh-client \
    