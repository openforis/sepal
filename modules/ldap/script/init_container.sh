#!/bin/bash

rm -f /data/content_added /data/keypair_generated

function template {
    local template=$1
    local destination=$2
    envsubst < $template > $destination
}

if [ ! -f /container/service/slapd/assets/certs/ldap-key.pem ]; then
  echo "********************************"
  echo "*** Generating LDAP key-pair ***"
  echo "********************************"
  # https://kubernetes.io/docs/tasks/administer-cluster/certificates/
  template /config/csr.conf /tmp/csr.conf
  openssl genrsa -out ldap-ca.key.pem 4096
  openssl req -x509 -new -subj "/O=SEPAL/CN=localhost" -nodes -key ldap-ca.key.pem -sha256 -days 3650 -out ldap-ca.crt.pem
  openssl genrsa -out ldap-key.pem 2048

  openssl req -new -key ldap-key.pem -out ldap-csr.pem -config /tmp/csr.conf
  openssl x509 -req -in ldap-csr.pem -CA ldap-ca.crt.pem -CAkey ldap-ca.key.pem \
    -CAcreateserial -out  ldap-crt.pem -days 3650 \
    -extensions v3_ext -extfile /tmp/csr.conf

  cp -f ./*.pem /container/service/slapd/assets/certs/
fi
exec /usr/bin/supervisord -c /config/supervisord.conf
