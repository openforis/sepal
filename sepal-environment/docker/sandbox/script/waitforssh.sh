#!/usr/bin/env bash


sshWaiting=true
netstat -ntlp | grep ":22"  >/dev/null 2>&1 && sshWaiting=false
while $sshWaiting;
do
    echo "Trying again"
    netstat -ntlp | grep ":22"  >/dev/null 2>&1 && sshWaiting=false
done