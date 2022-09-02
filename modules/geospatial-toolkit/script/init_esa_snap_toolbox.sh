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

echo "snap.userdir=/tmp/.snap" >> /usr/local/snap/etc/snap.properties

sen2cor=Sen2Cor-02.10.01-Linux64
wget https://step.esa.int/thirdparties/sen2cor/2.10.0/$sen2cor.run
chmod +x $sen2cor.run
mv $sen2cor.run /usr/local/lib/
cd /usr/local/lib
./$sen2cor.run
rm $sen2cor.run
chmod -R +r /usr/local/lib/$sen2cor
ln -sf /usr/local/lib/$sen2cor/bin/L2A_Process /usr/local/bin/L2A_Process
mv /root/sen2cor /etc/sen2cor
chmod 755 $(find /etc/sen2cor -type d)
chmod 644 $(find /etc/sen2cor -type f)

snap --nosplash --nogui --modules --update-all 2>&1 | while read -r line; do \
        echo "$line" && \
        [ "$line" = "updates=0" ] && sleep 2 && pkill -TERM -f "snap/jre/bin/java"; \
done; exit 0
