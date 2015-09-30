#!/usr/bin/env bash
useradd ${ADMIN_USERNAME} -s /bin/bash -m -d "/home/${ADMIN_USERNAME}"
echo ${ADMIN_USERNAME}:${ADMIN_PASSWORD} | chpasswd


useradd ${WEB_ADMIN_USERNAME} -s /bin/bash  -m -d "/home/${WEB_ADMIN_USERNAME}"
echo ${WEB_ADMIN_USERNAME}:${WEB_ADMIN_PASSWORD} | chpasswd

usermod -aG "${USER_GROUP}" "${WEB_ADMIN_USERNAME}"

mv /create_user "/home/${ADMIN_USERNAME}/"
chown ${ADMIN_USERNAME}:${ADMIN_USERNAME} "/home/${ADMIN_USERNAME}/create_user"

echo "${ADMIN_USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${ADMIN_USERNAME}
chmod 440 /etc/sudoers.d/${ADMIN_USERNAME}

printf  "USER_GROUP=%s\n" "$USER_GROUP" >> etc/environment

/usr/bin/supervisord