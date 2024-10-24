#!/usr/bin/env bash
sudo mkdir -p /usr/local/share/jupyter/current-kernels
sudo mkdir -p /usr/local/share/jupyter/kernels
sudo mkdir -p /usr/local/share/jupyter/log

sudo cp -rn /etc/sepal/app-manager/kernels-templates/* /usr/local/share/jupyter/current-kernels
# [HACK] Ensures /usr/local/share/jupyter/voila is available when docker volume is shadowing
sudo ln -sf /usr/local/share/voila /usr/local/share/jupyter/voila
source /home/node/.nvm/nvm.sh 

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  NODE_TLS_REJECT_UNAUTHORIZED=0 exec nodemon \
    --watch "${MODULE}/src" \
    --watch "${MODULE}/config" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9230 \
    src/main.js
else
  echo "Starting node"
  exec node \
    src/main.js
fi
