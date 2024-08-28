#!/bin/bash

function sepalAvailable()  {
    ldapsearch \
        -LLxh localhost \
        -b dc=sepal,dc=org \
        -D "cn=admin,dc=sepal,dc=org" \
        -w "$LDAP_ADMIN_PASSWORD" \
        | grep "dc=sepal,dc=org" | wc -l
}

for i in {50..0}; do
    if [ $(sepalAvailable) -eq 0 ]; then
        echo 'Waiting for LDAP...'
        /bin/sleep 1
    else
	    break
    fi
done
if [ "$i" = 0 ]; then
    echo >&2 'LDAP init process failed.'
	exit 1
fi

echo "Setting up content..."
ldapadd -x -D cn=admin,dc=sepal,dc=org -w "$LDAP_ADMIN_PASSWORD" -f /config/add_content.ldif

CA_FILE=/container/service/slapd/assets/certs/ldap-ca.crt.pem
for i in {50..0}; do
    if [ ! -f "${CA_FILE}" ]; then
        echo "Waiting for ${CA_FILE} to be created"
        /bin/sleep 1
    else
	    break
    fi
done
if [[ -L "${CA_FILE}" ]]
then
  echo
  echo "**** Replacing soft-link: ${CA_FILE}"
  cp -Lf "${CA_FILE}" "${CA_FILE}.temp"
  mv -f "${CA_FILE}.temp" "${CA_FILE}"
  chown openldap: "${CA_FILE}"
else
  echo
  echo "**** Not a soft-link: ${CA_FILE}"
fi

touch /data/content_added
echo "LDAP initialized"

exit 0
