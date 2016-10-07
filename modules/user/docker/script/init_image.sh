#!/usr/bin/env bash

apt-get update && apt-get install -y software-properties-common

# Repository for Java
add-apt-repository -y ppa:webupd8team/java

apt-get -y update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    curl \
    gettext \
    jq \
    ldapscripts \
    libpam-sss \
    libnss-sss \
    libnss-ldap \
    openssh-client \
    sssd \
    sssd-tools \
    supervisor

# Installing Java
echo oracle-java8-installer shared/accepted-oracle-license-v1-1 select true | debconf-set-selections
apt-get install -y oracle-java8-installer

echo "initgroups: files sss" >> /etc/nsswitch.conf