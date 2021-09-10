#!/bin/bash
set -e

echo
echo "***********************************"
echo "*** Installing ESA SNAP Toolbox ***"
echo "***********************************"
INSTALL_SCRIPT=esa-snap_all_unix_8_0.sh
wget -nv http://step.esa.int/downloads/8.0/installers/$INSTALL_SCRIPT
sh $INSTALL_SCRIPT -q -overwrite
rm -f $INSTALL_SCRIPT

snap --nosplash --nogui --modules --update-all 2>&1 | while read -r line; do \
        echo "$line" && \
        [ "$line" = "updates=0" ] && sleep 2 && pkill -TERM -f "snap/jre/bin/java"; \
done; exit 0
