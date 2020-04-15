#!/bin/bash
set -e

function template {
    local template=$1
    local destination=$2
    local destination_dir=`dirname $destination`
    sudo -i mkdir -p $destination_dir
    sudo -i chown sepal $destination_dir
    sudo rm -f $destination
    envsubst < $template > $destination
}

PROJECT_DIR=/usr/local/lib/sepal
sudo chmod +x $PROJECT_DIR/dev-env/*.sh
sudo ln -sf $PROJECT_DIR/dev-env/sepal-setup.sh /usr/local/bin/sepal-setup
sudo ln -sf $PROJECT_DIR/dev-env/sepal.sh /usr/local/bin/sepal
sudo ln -sf $PROJECT_DIR/dev-env/parse-yaml.sh /usr/local/bin/parse-yaml
sudo ln -sf $PROJECT_DIR/dev-env/template.d /etc/sepal/template.d

eval $(parse-yaml /etc/sepal/conf.d/secret.yml)

export GOOGLE_MAPS_API_KEY=$google_maps_api_key
export GOOGLE_EARTH_ENGINE_ACCOUNT=$google_earth_engine_account
export GOOGLE_EARTH_ENGINE_PRIVATE_KEY=$google_earth_engine_private_key
export GOOGLE_OAUTH_CLIENT_ID=$google_oauth_client_id
export GOOGLE_OAUTH_CLIENT_SECRET=$google_oauth_client_secret
export SMTP_FROM=$smtp_from
export SMTP_HOST=$smtp_host
export SMTP_PORT=$smtp_port
export SMTP_USERNAME=$smtp_username
export SMTP_PASSWORD=$smtp_password
export SEPAL_HOST=`dig +short myip.opendns.com @resolver1.opendns.com`

sudo -i mkdir -p /etc/sepal/module.d
sudo -i chown sepal /etc/sepal/module.d
sudo -i mkdir -p /var/sepal
sudo -i chown sepal /var/sepal
sudo -i mkdir -p /var/log/sepal
sudo -i chown sepal /var/log/sepal

TEMPLATE_DIR=$PROJECT_DIR/dev-env/template.d
cp -R $TEMPLATE_DIR/* /etc/sepal/module.d/
template $TEMPLATE_DIR/sepal-server/dataSearch.properties /etc/sepal/module.d/sepal-server/dataSearch.properties
template $TEMPLATE_DIR/sepal-server/workerInstance.properties /etc/sepal/module.d/sepal-server/workerInstance.properties
template $TEMPLATE_DIR/user/smtp.properties /etc/sepal/module.d/user/smtp.properties
template $TEMPLATE_DIR/user/user-server.properties /etc/sepal/module.d/user/user-server.properties

mkdir -p etc/sepal/module.d/google-earth-engine
cp /etc/sepal/conf.d/certificates/gee-service-account.pem /etc/sepal/module.d/google-earth-engine/gee-service-account.pem

mkdir -p etc/sepal/module.d/api-gateway
cp /etc/sepal/conf.d/certificates/sepal-https.* /etc/sepal/module.d/api-gateway

/bin/bash
