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
        sleep 1
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

echo "Content setup"
touch /data/started
echo "LDAP started"
exit 0