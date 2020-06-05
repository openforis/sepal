#!/usr/bin/env bash

HOME_DIR=/home/$USERNAME_SEPAL_ENV
EE_PRIVATE_KEY=${EE_PRIVATE_KEY_SEPAL_ENV//-----LINE BREAK-----/\\n}

if id "$USERNAME_SEPAL_ENV" >/dev/null 2>&1; then
    echo "User already exists: $USERNAME_SEPAL_ENV"
else
    GROUP_ID=`stat -c '%g' $HOME_DIR`
    USER_ID=`stat -c '%u' $HOME_DIR`
    echo "Creating user and group: $USERNAME_SEPAL_ENV. HOME_DIR=$HOME_DIR, GROUP_ID=$GROUP_ID, USER_ID=$USER_ID"
    groupadd -g $GROUP_ID $USERNAME_SEPAL_ENV
    useradd -u $USER_ID -g $GROUP_ID $USERNAME_SEPAL_ENV
fi

exec sudo -Eu $USERNAME_SEPAL_ENV "PATH=$PATH" node \
    src/main.js \
    --gee-email "$EE_ACCOUNT_SEPAL_ENV" \
    --gee-key "$EE_PRIVATE_KEY" \
    --sepal-host "$SEPAL_HOST_SEPAL_ENV" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD_SEPAL_ENV" \
    --home-dir $HOME_DIR \
    --username $USERNAME_SEPAL_ENV
