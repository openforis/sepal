#!/bin/bash
set -e

getent group sepal &>/dev/null || groupadd -g 9999 sepal # Add sepal group if not existing
id -u geoserver &>/dev/null || useradd -u 998 -g 9999 geoserver # Add geoserver user with sepal as group if not existing

mkdir -p /data/geoserver -m 770
chown geoserver:sepal /data/geoserver

mkdir -p /data/logs -m 770
chown geoserver:sepal /data/logs

chown -R geoserver:sepal /opt/geoserver/

rm -f /opt/geoserver/data_dir/logs && ln -s /data/logs /opt/geoserver/data_dir/logs

if [ -n "${ADMIN_PASSWD}" ]; then
cat > /opt/geoserver/data_dir/security/usergroup/default/users.xml <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<userRegistry version="1.0" xmlns="http://www.geoserver.org/security/users">
<users><!-- edited --><user enabled="true" name="admin" password="plain:${ADMIN_PASSWD}"/></users>
<groups/></userRegistry>
EOF
fi

cd /opt/geoserver
sudo -u geoserver java -jar start.jar
    -Xms128m -Xmx512m \
    -DGEOSERVER_DATA_DIR=/opt/geoserver/data_dir \
    -Djava.awt.headless=true \

