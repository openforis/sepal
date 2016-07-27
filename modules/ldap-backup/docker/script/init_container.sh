#!/bin/bash

LATEST_CONFIG=$(ls -t /data/backup | grep config | head -n1)
LATEST_DATA=$(ls -t /data/backup | grep data | head -n1)

# Recreate Osixia environment
ln -sf /container/service/slapd-backup/assets/tool/* /sbin/
mkdir /container/run/
touch /container/run/environment.sh 
chmod +x /container/run/environment.sh

if [[ "$RESTORE_BACKUP" == "True" ]]; then
	rm -rf /data/old-config && mkdir /data/old-config && mv /etc/ldap/slapd.d/* /data/old-config/
	rm -rf /data/old-data && mkdir /data/old-data && mv /var/lib/ldap/* /data/old-data/
    /sbin/slapd-restore-config "/data/backup/$LATEST_CONFIG" gzipped
    /sbin/slapd-restore-data "/data/backup/$LATEST_DATA" gzipped
fi

cat >/etc/cron.d/slapd-backup <<EOL
$LDAP_BACKUP_CONFIG_CRON_EXP root export LDAP_BACKUP_TTL=$LDAP_BACKUP_TTL; /sbin/slapd-backup-config
$LDAP_BACKUP_DATA_CRON_EXP root export LDAP_BACKUP_TTL=$LDAP_BACKUP_TTL; /sbin/slapd-backup-data
EOL

touch /shared/backup-started

# http://veithen.github.io/2014/11/16/sigterm-propagation.html
trap 'kill -TERM $PID' TERM INT
cron -f &
PID=$!
wait $PID
trap - TERM INT
wait $PID
EXIT_STATUS=$?

