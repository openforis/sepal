#!/usr/bin/env bash

SEPAL_PWD=$1
SHADOW_FILE_LOCATION=$2
DATA_HOME=$3
PUBLIC_DIR=$4
#DOCKER_REPO_HOST=$3
#ADMIN_PWD=$4
#WEB_ADMIN_PWD=$5
RESULT=$(docker exec -it mysql mysql -N -B --host=mysql --database sdms --user=sepal --password=$SEPAL_PWD -e "SELECT username FROM users")

COUNTER=0
while read -r user; do
    COUNTER=$((COUNTER + 1))
    if [ "$COUNTER" -gt 1 ]; then
        userName=$(echo "$user"|tr -d "\n")
        userName=$(echo -e "${userName}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

        USER_PWD=$(sudo cat $SHADOW_FILE_LOCATION | grep $userName)
        if [ ! -z "$USER_PWD" ]; then
            SHADOW_ENTRIES=$(echo $USER_PWD | tr ":" "\n")
            SHADOW_COUNTER=0
            for SHADOW_ENTRY in $SHADOW_ENTRIES;
            do
               SHADOW_COUNTER=$((SHADOW_COUNTER + 1))
               if [ "$SHADOW_COUNTER" -eq 2 ]; then
                SHADOW_ENTRY=$(echo "$SHADOW_ENTRY"|tr -d "\n")
                SHADOW_ENTRY=$(echo -e "${SHADOW_ENTRY}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
                SHADOW_ENTRY=$(echo -e "${SHADOW_ENTRY}"| tr "$" "\$")
                USER_ID=$(docker exec -t ssh-gateway /home/sepalAdmin/create_user $userName $SHADOW_ENTRY sepalUsers true)
                USER_ID=$(echo "$USER_ID"|tr -d "\r")
                echo "$USER_ID"
                sudo chown -R $USER_ID:sepal "$DATA_HOME/$userName"
                sudo mkdir -p "$PUBLIC_DIR/$userName"
                sudo chown "$USER_ID" "$PUBLIC_DIR/$userName"
                if [ ! -h "$DATA_HOME/$userName/public" ]; then
                    sudo ln -s "$PUBLIC_DIR" "$DATA_HOME/$userName/"
                fi
                QUERY="UPDATE users SET user_uid=$USER_ID where  username = '$userName'"
                docker exec -d mysql mysql --host=mysql --database sdms --user=sepal --password=$SEPAL_PWD -e "$QUERY"
                break
               fi
            done

        fi

    fi
done <<< "$RESULT"
