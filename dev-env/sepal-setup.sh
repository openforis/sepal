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

# Re-enable TLSv1 and TLSv1.1 for java mail
sed -i 's/jdk.tls.disabledAlgorithms=.*/jdk.tls.disabledAlgorithms=SSLv3, RC4, DES, MD5withRSA, /' /home/sepal/.sdkman/candidates/java/current/conf/security/java.security

sudo chmod +x $PROJECT_DIR/dev-env/*.sh
sudo ln -sf $PROJECT_DIR/dev-env/sepal-setup.sh /usr/local/bin/sepal-setup
sudo ln -sf $PROJECT_DIR/dev-env/sepal.sh /usr/local/bin/sepal
sudo ln -sf $PROJECT_DIR/dev-env/parse-yaml.sh /usr/local/bin/parse-yaml
sudo ln -sf $PROJECT_DIR/dev-env/template.d /etc/sepal/template.d

sudo ln -sf $PROJECT_DIR/modules/app-manager/install-requirements.sh /usr/local/bin/install-requirements
sudo chmod +x /usr/local/bin/install-requirements

sudo mkdir -p /usr/local/share/jupyter/kernels/
sudo cp -rn $PROJECT_DIR/modules/app-manager/kernels/* /usr/local/share/jupyter/kernels/

sudo mkdir -p /etc/sepal/gateway
sudo cp -rn $PROJECT_DIR/modules/app-manager/kernels/* /usr/local/share/jupyter/kernels/

chmod +x $PROJECT_DIR/lib/python/shared/stack_time_series.py
sudo ln -sf $PROJECT_DIR/lib/python/shared/stack_time_series.py /usr/local/bin/sepal-stack-time-series

eval $(parse-yaml /etc/sepal/conf.d/secret.yml)

export NORWAY_PLANET_API_KEY=$norway_planet_api_key
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

sudo mkdir -p /etc/sepal/module.d
sudo chown sepal /etc/sepal/module.d
sudo mkdir -p /var/sepal
sudo chown sepal /var/sepal
sudo mkdir -p /var/log/sepal
sudo chown sepal /var/log/sepal

TEMPLATE_DIR=$PROJECT_DIR/dev-env/template.d
cp -R $TEMPLATE_DIR/* /etc/sepal/module.d/
template $TEMPLATE_DIR/gateway/modules.json /etc/sepal/module.d/gateway/modules.json
template $TEMPLATE_DIR/sepal-server/dataSearch.properties /etc/sepal/module.d/sepal-server/dataSearch.properties
template $TEMPLATE_DIR/sepal-server/workerInstance.properties /etc/sepal/module.d/sepal-server/workerInstance.properties
template $TEMPLATE_DIR/user/smtp.properties /etc/sepal/module.d/user/smtp.properties
template $TEMPLATE_DIR/user/user-server.properties /etc/sepal/module.d/user/user-server.properties


mkdir -p /etc/sepal/module.d/google-earth-engine
sudo cp /etc/sepal/conf.d/certificates/gee-oauth.json /etc/sepal/module.d/google-earth-engine/gee-oauth.json
sudo chown -R sepal: /etc/sepal/module.d/google-earth-engine


