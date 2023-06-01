#!/usr/bin/env bash

HOME_DIR=/home/$USERNAME
EE_PRIVATE_KEY=${EE_PRIVATE_KEY//-----LINE BREAK-----/\\n}

if id "$USERNAME" >/dev/null 2>&1; then
    echo "User already exists: $USERNAME"
else
    GROUP_ID=`stat -c '%g' $HOME_DIR`
    USER_ID=`stat -c '%u' $HOME_DIR`
    echo "Creating user and group: $USERNAME. HOME_DIR=$HOME_DIR, GROUP_ID=$GROUP_ID, USER_ID=$USER_ID"
    groupadd -g $GROUP_ID $USERNAME
    useradd -u $USER_ID -g $GROUP_ID $USERNAME
fi

if [[ "${DEPLOY_ENVIRONMENT}" == "DEV" ]]
then
  echo "Starting nodemon"
  [[ -d node_modules ]] || npm install
  exec sudo -Eu $USERNAME "PATH=$PATH NODE_TLS_REJECT_UNAUTHORIZED=0" nodemon \
    --watch "${MODULE}"/src \
    --watch "${MODULE}/config" \
    --watch "${JS_SHARED}" \
    --inspect=0.0.0.0:9234 \
    src/main.js \
    --gee-email "$EE_ACCOUNT" \
    --gee-key "$EE_PRIVATE_KEY" \
    --google-project-id "$GOOGLE_PROJECT_ID" \
    --google-region "$GOOGLE_REGION" \
    --sepal-host "$SEPAL_HOST" \
    --sepal-endpoint "$SEPAL_ENDPOINT" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD" \
    --home-dir $HOME_DIR \
    --username $USERNAME
else
  echo "Starting node"
  exec sudo -Eu $USERNAME "PATH=$PATH" node \
    src/main.js \
    --gee-email "$EE_ACCOUNT" \
    --gee-key "$EE_PRIVATE_KEY" \
    --google-project-id "$GOOGLE_PROJECT_ID" \
    --google-region "$GOOGLE_REGION" \
    --sepal-host "$SEPAL_HOST" \
    --sepal-endpoint "$SEPAL_ENDPOINT" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD" \
    --home-dir $HOME_DIR \
    --username $USERNAME
fi
