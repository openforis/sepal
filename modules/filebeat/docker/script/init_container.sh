#!/bin/sh
# Based on https://github.com/bargenson/docker-filebeat
set -e

CONTAINERS_FOLDER=/tmp/containers
NAMED_PIPE=/tmp/pipe

setConfiguration() {
    KEY=$1
    VALUE=$2
    sed -i "s/{{$KEY}}/$VALUE/g" /config/filebeat.yml
}

getRunningContainers() {
    curl --no-buffer -s -XGET --unix-socket /tmp/docker.sock http:/containers/json | python -c "
import json, sys
containers=json.loads(sys.stdin.readline())
for container in containers:
    print(container['Id'])"
}

getContainerName() {
    curl --no-buffer -s -XGET --unix-socket /tmp/docker.sock http:/containers/$1/json | python -c "
import json, sys
container=json.loads(sys.stdin.readline())
print(container['Name'])
" | sed 's;/;;'
}

createContainerFile() {
    touch "$CONTAINERS_FOLDER/$1"
}

removeContainerFile() {
    rm "$CONTAINERS_FOLDER/$1"
}

collectContainerLogs() {
    local CONTAINER=$1
    echo "Processing $CONTAINER..."
    createContainerFile $CONTAINER
    CONTAINER_NAME=`getContainerName $CONTAINER`
    python /config/dockerlog.py $CONTAINER $CONTAINER_NAME > $NAMED_PIPE
    echo "Disconnected from $CONTAINER."
    removeContainerFile $CONTAINER
}

if [ -n "${LOGSTASH_HOST+1}" ]; then
    setConfiguration "LOGSTASH_HOST" "$LOGSTASH_HOST"
else
    echo "LOGSTASH_HOST is needed"
    exit 1
fi

if [ -n "${LOGSTASH_PORT+1}" ]; then
    setConfiguration "LOGSTASH_PORT" "$LOGSTASH_PORT"
else
    echo "LOGSTASH_PORT is needed"
    exit 1
fi

if [ -n "${SHIPPER_NAME+1}" ]; then
    setConfiguration "SHIPPER_NAME" "$SHIPPER_NAME"
else
    setConfiguration "SHIPPER_NAME" "`hostname`"
fi

rm -rf "$CONTAINERS_FOLDER"
rm -rf "$NAMED_PIPE"
mkdir "$CONTAINERS_FOLDER"
mkfifo -m a=rw "$NAMED_PIPE"

pgid=$(ps -o pgid= $PID | grep -o '[0-9]*')
trap "kill -- -$pgid" EXIT INT TERM

echo "Initializing Filebeat..."
cat $NAMED_PIPE | filebeat -c /config/filebeat.yml -e -v &

while true; do
    CONTAINERS=`getRunningContainers`
    for CONTAINER in $CONTAINERS; do
        if ! ls $CONTAINERS_FOLDER | grep -q $CONTAINER; then
            collectContainerLogs $CONTAINER &
        fi
    done
    sleep 5
done

