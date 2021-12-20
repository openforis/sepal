#!/usr/bin/env bash

KEY_DIR=/etc/letsencrypt/live/$SEPAL_HOST
if [[ ! -d $KEY_DIR ]]
then
  echo "Creating self-signed keypair"
  mkdir -p $KEY_DIR
  cd $KEY_DIR
  openssl req -x509 -out cert.pem -keyout privkey.pem \
    -newkey rsa:2048 -nodes -sha256 \
    -subj '/CN=localhost' -extensions EXT -config <( \
     printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")
  cat privkey.pem cert.pem > fullchain.pem
fi

sleep 30 # Make sure HAproxy had time to start

openssl req -x509 -out localhost.crt -keyout localhost.key \
  -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=localhost' -extensions EXT -config <( \
   printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")


~/.acme.sh/acme.sh --issue --dns dns_aws -d $SEPAL_HOST

~/.acme.sh/acme.sh --install-cert -d $SEPAL_HOST \
  --cert-file      $KEY_DIR/cert.pem  \
  --key-file       $KEY_DIR/privkey.pem  \
  --fullchain-file $KEY_DIR/fullchain.pem

exec /usr/bin/supervisord -c /config/supervisord.conf
