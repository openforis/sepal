#!/usr/bin/env bash

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    curl \
    wget \
    php5-mcrypt \
    openssh-server \
    libssh2-1-dev \
    libssh2-php \
    php5-curl \
    php5-gd \
    php5-mysql \
    gettext # envsubst for templating

echo 'www-data ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/www-data
chmod 440 /etc/sudoers.d/www-data
php5enmod mcrypt
a2enmod rewrite
a2enmod ssl
mkdir /var/run/sshd
rm -rf /etc/apache2/sites-enabled
mkdir -p /etc/apache2/sites-enabled
