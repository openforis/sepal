#!/bin/bash
set -e

function template {
    local template=$1
    local destination=$2
    local destination_dir=`dirname $destination`
    sudo -i mkdir -p $destination_dir
    sudo -i chown sepal $destination_dir
    rm -f $destination
    envsubst < $template > $destination
}

function parse_yaml {
   local prefix=$2
   local s='[[:space:]]*' w='[a-zA-Z0-9_]*' fs=$(echo @|tr @ '\034')
   sed -ne "s|^\($s\):|\1|" \
        -e "s|^\($s\)\($w\)$s:$s[\"']\(.*\)[\"']$s\$|\1$fs\2$fs\3|p" \
        -e "s|^\($s\)\($w\)$s:$s\(.*\)$s\$|\1$fs\2$fs\3|p"  $1 |
   awk -F$fs '{
      indent = length($1)/2;
      vname[indent] = $2;
      for (i in vname) {if (i > indent) {delete vname[i]}}
      if (length($3) > 0) {
         vn=""; for (i=0; i<indent; i++) {vn=(vn)(vname[i])("_")}
         printf("%s%s%s=\"%s\"\n", "'$prefix'",vn, $2, $3);
      }
   }'
}

eval $(parse_yaml /etc/sepal/conf.d/secret.yml)

export GOOGLE_MAPS_API_KEY=$googleMapsApiKey
export GOOGLE_EARTH_ENGINE_ACCOUNT=$googleEarthEngineAccount
export GOOGLE_EARTH_ENGINE_PRIVATE_KEY=$googleEarthEnginePrivateKey
export GOOGLE_OAUTH_CLIENT_ID=$googleOAuthClientId
export GOOGLE_OAUTH_CLIENT_SECRET=$googleOAuthClientSecret
export SMTP_FROM=$smtp_from
export SMTP_HOST=$smtp_host
export SMTP_PORT=$smtp_port
export SMTP_USERNAME=$smtp_username
export SMTP_PASSWORD=$smtp_password

sudo -i mkdir -p /etc/sepal/module.d
sudo -i chown sepal /etc/sepal/module.d
sudo -i mkdir -p /var/sepal
sudo -i chown sepal /var/sepal

cp -R /etc/sepal/template.d/* /etc/sepal/module.d/

template /etc/sepal/template.d/sepal-server/dataSearch.properties /etc/sepal/module.d/sepal-server/dataSearch.properties
template /etc/sepal/template.d/sepal-server/workerInstance.properties /etc/sepal/module.d/sepal-server/workerInstance.properties
template /etc/sepal/template.d/user/smtp.properties /etc/sepal/module.d/user/smtp.properties
template /etc/sepal/template.d/user/user-server.properties /etc/sepal/module.d/user/user-server.properties

mkdir -p etc/sepal/module.d/google-earth-engine
cp /etc/sepal/conf.d/certificates/gee-service-account.pem /etc/sepal/module.d/google-earth-engine/gee-service-account.pem

mkdir -p etc/sepal/module.d/api-gateway
cp /etc/sepal/conf.d/certificates/sepal-https.* /etc/sepal/module.d/api-gateway

/bin/bash
