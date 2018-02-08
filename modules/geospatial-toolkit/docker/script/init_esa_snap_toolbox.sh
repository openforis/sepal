#!/bin/bash
set -e

echo
echo "***********************************"
echo "*** Installing ESA SNAP Toolbox ***"
echo "***********************************"
wget http://step.esa.int/downloads/5.0/installers/esa-snap_sentinel_unix_5_0.sh
sh esa-snap_sentinel_unix_5_0.sh -q -overwrite
rm -f esa-snap_sentinel_unix_5_0.sh
echo 'SNAP_EXE=/usr/local/snap/bin/gpt' | tee -a /etc/environment
snap --nosplash --nogui --modules --update-all
