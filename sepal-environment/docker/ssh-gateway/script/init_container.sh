#!/usr/bin/env bash



if [ -f "/users/passwd" ]; then
yes | cp -rf /users/passwd /etc/
fi

if [ -f "/users/group" ]; then
yes | cp -rf /users/group /etc/
fi

if [ -f "/users/shadow" ]; then
yes | cp -rf /users/shadow /etc/
fi

if [ -f "/users/gshadow" ]; then
yes | cp -rf /users/gshadow /etc/
fi

adminExist=false
getent passwd ${ADMIN_USERNAME}  >/dev/null 2>&1 && adminExist=true

if $adminExist; then
echo "user $ADMIN_USERNAME already exist"
else
useradd ${ADMIN_USERNAME} -s /bin/bash -m -d "/home/${ADMIN_USERNAME}"
fi

webAdminExist=false
getent passwd ${WEB_ADMIN_USERNAME}  >/dev/null 2>&1 && webAdminExist=true

if $webAdminExist; then
echo "user $WEB_ADMIN_USERNAME already exist"
else
useradd ${WEB_ADMIN_USERNAME} -s /bin/bash -m -d "/home/${ADMIN_USERNAME}"
usermod -aG "${USER_GROUP}" "${WEB_ADMIN_USERNAME}"
fi

echo ${ADMIN_USERNAME}:${ADMIN_PASSWORD} | chpasswd
echo ${WEB_ADMIN_USERNAME}:${WEB_ADMIN_PASSWORD} | chpasswd


mv /create_user "/home/${ADMIN_USERNAME}/"
chown ${ADMIN_USERNAME}:${ADMIN_USERNAME} "/home/${ADMIN_USERNAME}/create_user"

echo "${ADMIN_USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${ADMIN_USERNAME}
chmod 440 /etc/sudoers.d/${ADMIN_USERNAME}

printf '%s\n' "USER_GROUP=%s" "$USER_GROUP" >> etc/environment

/usr/bin/supervisord