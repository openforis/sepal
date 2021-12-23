#!/usr/bin/env bash
sudo cp -rn /etc/sepal/app-manager/kernels-templates/* /usr/local/share/jupyter/kernels/

source /home/node/.nvm/nvm.sh

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  exec nodemon \
    --watch "${MODULE}/src" \
    --watch "${SHARED}" \
    --inspect=0.0.0.0:9230 \
    src/main.js
else
  echo "Starting node"
  exec node \
      src/main.js
fi
