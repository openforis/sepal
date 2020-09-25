#!/bin/bash
set -e

echo
echo "***********************************"
echo "*** Installing ESA SNAP Toolbox ***"
echo "***********************************"
INSTALL_SCRIPT=esa-snap_all_unix_7_0.sh
wget -nv http://step.esa.int/downloads/7.0/installers/$INSTALL_SCRIPT
sh $INSTALL_SCRIPT -q -overwrite
rm -f $INSTALL_SCRIPT

#snap --nosplash --nogui --modules --update-all
