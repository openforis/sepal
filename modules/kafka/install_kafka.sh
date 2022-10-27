#!/usr/bin/env bash

path=/kafka/${KAFKA_VERSION}/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz

downloadUrl=$(curl --stderr /dev/null "https://www.apache.org/dyn/closer.cgi?path=${path}&as_json=1" | jq -r '"\(.preferred)\(.path_info)"')

if [[ ! $(curl -sfI "${downloadUrl}") ]]; then
    downloadUrl="https://archive.apache.org/dist/${path}"
fi

wget "${downloadUrl}" -O "/tmp/kafka.tgz"

tar xfz /tmp/kafka.tgz -C /opt

rm /tmp/kafka.tgz

ln -s /opt/kafka_${SCALA_VERSION}-${KAFKA_VERSION} /opt/kafka
