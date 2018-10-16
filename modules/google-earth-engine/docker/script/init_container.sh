#!/usr/bin/env bash

worker_user=$1
downloadDir=/home/${worker_user}/downloads
account=${EE_ACCOUNT_SEPAL_ENV}
privateKey=${EE_PRIVATE_KEY_SEPAL_ENV//-----LINE BREAK-----/\\n}
sepalHost=${SEPAL_HOST_SEPAL_ENV}
sepalPassword=${SEPAL_ADMIN_PASSWORD_SEPAL_ENV}

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

mkdir -p /etc/ssh/google-earth-engine
privateKeyPath=/etc/ssh/google-earth-engine/key.pem
echo -e ${privateKey} > ${privateKeyPath}

exec gunicorn\
 --pythonpath /src\
 --bind 0.0.0.0:5001\
 --workers 5\
 --timeout 3600\
 --threads 16\
 --backlog 64\
 --error-logfile -\
 --log-file -\
 --access-logfile -\
 --log-level debug\
 --capture-output "server:build_app({\
    'gee_email': '${account}',\
    'gee_key_path': '${privateKeyPath}',\
    'sepal_host': '${sepalHost}',\
    'sepal_username': 'sepalAdmin',\
    'sepal_password': '${sepalPassword}'\
})" server:build_app
