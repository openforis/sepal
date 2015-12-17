#!/bin/bash

sleep 10
ldapWaiting=true
netstat -ntlp | grep ":389"  >/dev/null 2>&1 && ldapWaiting=false

for i in {50..0}; do
    if netstat -ntlp | grep ":389"  >/dev/null 2>&1; then
		break
	fi
	echo 'Waiting for LDAP...'
	sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 'LDAP init process failed.'
	exit 1
fi

ldapadd -x -D cn=admin,dc=sepal,dc=org -w "$LDAP_ADMIN_PASSWORD" -f /config/add_content.ldif || true
