#!/bin/bash
set -e

export JAVA_HOME="/usr/lib/jvm/java-8-oracle"

if [ -n "${ADMIN_PASSWD}" ]; then
    cat > /opt/geoserver/data_dir/security/usergroup/default/users.xml <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<userRegistry version="1.0" xmlns="http://www.geoserver.org/security/users">
<users><user enabled="true" name="admin" password="plain:${ADMIN_PASSWD}"/></users>
<groups/></userRegistry>
EOF
fi

USER=geoserver
GEOSERVER_DATA_DIR=/opt/geoserver/data_dir
GEOSERVER_HOME=/opt/geoserver

PATH=/usr/sbin:/usr/bin:/sbin:/bin
DESC="GeoServer daemon"
NAME=geoserver
DAEMON="$JAVA_HOME/bin/java"
PIDFILE=/var/run/$NAME.pid
SCRIPTNAME=/etc/init.d/$NAME

# Read configuration variable file if it is present
[ -r /etc/default/$NAME ] && . /etc/default/$NAME

DAEMON_ARGS="$JAVA_OPTS $DEBUG_OPTS -DGEOSERVER_DATA_DIR=$GEOSERVER_DATA_DIR -Djava.awt.headless=true -jar start.jar"

# Load the VERBOSE setting and other rcS variables
[ -f /etc/default/rcS ] && . /etc/default/rcS

# Define LSB log_* functions.
# Depend on lsb-base (>= 3.0-6) to ensure that this file is present.
. /lib/lsb/init-functions



        # Return
        #   0 if daemon has been started
        #   1 if daemon was already running
        #   2 if daemon could not be started

        start-stop-daemon --start --pidfile $PIDFILE --make-pidfile \
                --chuid $USER --chdir $GEOSERVER_HOME \
                -b --test --exec $DAEMON -- $DAEMON_ARGS > /dev/null \
                || return 1

        start-stop-daemon --start --pidfile $PIDFILE --make-pidfile \
                --chuid $USER --chdir $GEOSERVER_HOME \
                -b --exec $DAEMON -- $DAEMON_ARGS \
                || return 2
