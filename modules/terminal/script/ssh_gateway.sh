#!/bin/sh

USERNAME=$1
KEY_FILE=$2
TMP_KEY_FILE=$3
sudo cp ${KEY_FILE} ${TMP_KEY_FILE}
sudo chown node:node ${TMP_KEY_FILE}
sudo chmod 600 ${TMP_KEY_FILE}
# Back off only when connections keep dying instantly (gateway unreachable) — a single
# short-lived connection (e.g. its session was just stopped) reconnects immediately.
# Duration is measured with date +%s: this is busybox sh, where bash's SECONDS never ticks.
consecutive_short_runs=0
while :
do
	start=$(date +%s)
	ssh -t -q -o StrictHostKeyChecking=no -i ${TMP_KEY_FILE} ${USERNAME}@${SSH_GATEWAY_HOST}
	duration=$(( $(date +%s) - start ))
	clear
	echo "Restarting terminal..."
	if [ ${duration} -lt 3 ]; then
		consecutive_short_runs=$((consecutive_short_runs + 1))
	else
		consecutive_short_runs=0
	fi
	if [ ${consecutive_short_runs} -ge 2 ]; then
		sleep 5
	fi
done
