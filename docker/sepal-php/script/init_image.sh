#!/usr/bin/env bash

apt-get update && apt-get install -y curl wget php5-mcrypt openssh-server supervisor libssh2-1-dev libssh2-php php5-curl php5-gd php5-mysql
echo 'www-data ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/www-data
chmod 440 /etc/sudoers.d/www-data
php5enmod mcrypt
a2enmod rewrite
a2enmod ssl
groupadd -g 9999 sepal
usermod -aG sepal www-data
mkdir /var/run/sshd
rm -rf /etc/apache2/sites-enabled
mkdir -p /etc/apache2/sites-enabled
