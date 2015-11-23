#!/usr/bin/env bash


passwdToBeCopied=false
groupToBeCopied=false
shadowToBeCopied=false
gshadowToBeCopied=false

if [ -f "/users/passwd" ]; then
yes | cp -rf /users/passwd /etc/
else
passwdToBeCopied=true
fi

if [ -f "/users/group" ]; then
yes | cp -rf /users/group /etc/
else
groupToBeCopied=true
fi

if [ -f "/users/shadow" ]; then
yes | cp -rf /users/shadow /etc/
else
shadowToBeCopied=true
fi

if [ -f "/users/gshadow" ]; then
yes | cp -rf /users/gshadow /etc/
else
gshadowToBeCopied=true
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
useradd ${WEB_ADMIN_USERNAME} -u 1001 -s /bin/bash -m -d "/home/${WEB_ADMIN_USERNAME}"
usermod -aG "${USER_GROUP}" "${WEB_ADMIN_USERNAME}"
fi

echo ${ADMIN_USERNAME}:${ADMIN_PASSWORD} | chpasswd
echo ${WEB_ADMIN_USERNAME}:${WEB_ADMIN_PASSWORD} | chpasswd


if $passwdToBeCopied; then
yes | cp -rf /etc/passwd /users/
fi

if $groupToBeCopied; then
yes | cp -rf /etc/group /users/
fi

if $shadowToBeCopied; then
yes | cp -rf /etc/shadow /users/
fi

if $gshadowToBeCopied; then
yes | cp -rf /etc/gshadow /users/
fi



mv /create_user "/home/${ADMIN_USERNAME}/"
chown ${ADMIN_USERNAME}:${ADMIN_USERNAME} "/home/${ADMIN_USERNAME}/create_user"

echo "${ADMIN_USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${ADMIN_USERNAME}
chmod 440 /etc/sudoers.d/${ADMIN_USERNAME}

printf "USER_GROUP=%s" "$USER_GROUP" >> etc/environment

/usr/bin/supervisord