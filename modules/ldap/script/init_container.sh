#!/bin/bash

if [ ! -f /container/service/slapd/assets/certs/ldap-key.pem ]; then
  echo "********************************"
  echo "*** Generating LDAP key-pair ***"
  echo "********************************"
#  openssl genrsa 2048 > ldap-ca.key.pem
#  openssl req -new -x509 -nodes -days 3650 \
#    -subj /O=SEPAL/CN=ldap \
#    -key ldap-ca.key.pem -out ldap-ca.crt.pem
#  openssl req -newkey rsa:2048 -days 3650 \
#    -subj /O=SEPAL/CN=ldap \
#    -nodes -keyout ldap-key.pem -out ldap-crt.pem
#  openssl rsa -in ldap-key.pem -out ldap-key.pem
#  openssl x509 -req -in ldap-crt.pem -days 3650 \
#    -CA ldap-ca.crt.pem -CAkey ldap-ca.key.pem -set_serial 01 \
#    -out ldap-crt.pem
#
#  openssl verify -CAfile ldap-ca.crt.pem ldap-crt.pem


openssl genrsa -out ldap-ca.key.pem 4096
openssl req -x509 -new -subj "/O=SEPAL/CN=localhost" -nodes -key ldap-ca.key.pem -sha256 -days 3650 -out ldap-ca.crt.pem
openssl genrsa -out ldap-key.pem 2048
openssl req -new -sha256 -key ldap-key.pem -subj "/O=SEPAL/CN=ldap" -out ldap-csr.pem
openssl req -new -sha256 \
    -key ldap-key.pem \
    -subj "/O=SEPAL/CN=ldap" \
    -reqexts SAN \
    -config <(cat /etc/ssl/openssl.cnf \
        <(printf "\n[SAN]\nsubjectAltName=DNS:ldap,DNS:%s" "$LDAP_HOST")) \
    -out ldap-csr.pem
openssl x509 -req -in ldap-csr.pem -CA ldap-ca.crt.pem -CAkey ldap-ca.key.pem -CAcreateserial -out ldap-crt.pem -days 3650 -sha256

#openssl req -in ldap-csr.pem -noout -text
#openssl x509 -in ldap-crt.pem -text -noout
#openssl verify -CAfile ldap-ca.crt.pem ldap-crt.pem

cp -f ./*.pem /container/service/slapd/assets/certs/

  echo "CERTS: $(ls -la /container/service/slapd/assets/certs)"
  echo "ldap-crt.pem: $(cat /container/service/slapd/assets/certs/ldap-crt.pem)"
  echo "ldap-key.pem: $(cat /container/service/slapd/assets/certs/ldap-key.pem)"
fi

rm -f /data/module_initialized
exec /usr/bin/supervisord -c /config/supervisord.conf
