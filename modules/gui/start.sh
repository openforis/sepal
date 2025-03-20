#!/bin/sh

function template {
    local template=$1
    local destination=$2
    local destination_dir
    destination_dir=$(dirname "${destination}")
    mkdir -p "${destination_dir}"
    rm -f "${destination}"
    envsubst < "${template}" > "${destination}"
}

if [ "${DEPLOY_ENVIRONMENT}" == "DEV" ]; then
  if [ ! -d "node_modules" ]; then
    echo 'Missing node_modules. Installing...'
    npm install
  fi
  exec npm start
else
  ln -sf ${MODULE}/nginx.conf /etc/nginx/http.d/default.conf

  if [ ! -f "${MODULE}/dist/index-template.html" ]; then
      mv "${MODULE}/dist/index.html" "${MODULE}/dist/index-template.html"
  fi
  if [ ! -f "${MODULE}/dist/404-template.html" ]; then
      mv "${MODULE}/dist/404.html" "${MODULE}/dist/404-template.html"
  fi

  template "${MODULE}/dist/index-template.html" "${MODULE}/dist/index.html"
  template "${MODULE}/dist/404-template.html" "${MODULE}/dist/404.html"

  exec nginx -g 'daemon off;'
fi
