#!/bin/bash

for homeDir in /data/home/* ; do
    storageUsedFile=$homeDir/.storageUsed
    chown root: $storageUsedFile
    chmod 644 $storageUsedFile
    ionice -c 2 -n 7 nice -n 19 du -sk $homeDir > $storageUsedFile
done