#!/usr/bin/env bash
# https://datacenteroverlords.com/2012/03/01/creating-your-own-ssl-certificate-authority/
openssl genrsa -out sepalCA.key 2048
openssl req -x509 -new -nodes -key sepalCA.key -sha256 -days 3650 -out sepalCA.pem
openssl genrsa -out ldap.key 2048
openssl req -new -key ldap.key -out ldap.csr
openssl x509 -req -in ldap.csr -CA sepalCA.pem -CAkey sepalCA.key -CAcreateserial -out ldap.crt -days 3650 -sha256