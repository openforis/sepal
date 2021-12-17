#!/usr/bin/env bash

function template {
    local template=$1
    local destination=$2
    local destination_dir=`dirname $destination`
    mkdir -p $destination_dir
    rm -f $destination
    envsubst < $template > $destination
}

if [ ! -f $FRONTEND/build/index-template.html ]; then
    mv $FRONTEND/build/index.html $FRONTEND/build/index-template.html
fi

template $FRONTEND/build/index-template.html $FRONTEND/build/index.html

service nginx start
pid=$(ps aux | grep [/]usr/sbin/nginx | awk '{ print $2 }')
exec tail --pid=$pid -f /dev/null
