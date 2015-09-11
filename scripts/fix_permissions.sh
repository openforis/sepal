#!/bin/bash

# preliminary actions: remove sepal group
# create Sepal user | useradd -d /home/sepal sepal mkdir /home/sepal chown /home/sepal/ sepal
# add ubuntu to SepalGroup | sudo usermod -a -G sepal ubuntu


# $1 usually layers
# $2 usually /data/home/
# $3 usually sepal
# $4 usually sdmsrepository


LAYER_CONTAINER_FOLDER=$1
REPO_CONTAINER_FOLDER=$4
HOME_FOLDER=$2
LAYERS_GROUP=$3
FILES=$2/*
for DIRNAME in  $FILES;
do 
	HOMEDIR="${DIRNAME%/}"
    USERNAME="${HOMEDIR##*/}"
	LAYER_FOLDER="$DIRNAME/$LAYER_CONTAINER_FOLDER"
	REPO_FOLDER="$DIRNAME/$REPO_CONTAINER_FOLDER"
	sudo chown -R "$USERNAME:sepal" $DIRNAME
	USER_EXIST=false
	getent passwd $USERNAME >/dev/null 2>&1 && USER_EXIST=true
	if [ $USER_EXIST ]
	then
		if [ ! -e $LAYER_FOLDER ]
		then
			mkdir "$LAYER_FOLDER"
		fi
		chown -R "$USERNAME:$LAYERS_GROUP" "$LAYER_FOLDER"
		if [ -e $REPO_FOLDER ]
		then
			chown -R "$LAYERS_GROUP:$USERNAME" "$REPO_FOLDER"
		fi
		
	fi 
done
