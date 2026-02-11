#!/bin/bash
set -e

echo
echo "***********************************"
echo "*** Installing ESA SNAP Toolbox ***"
echo "***********************************"

INSTALL_SCRIPT="esa-snap_all_linux-13.0.0.sh"
wget -nv -O "$INSTALL_SCRIPT" "https://download.esa.int/step/snap/13.0/installers/$INSTALL_SCRIPT"
sh "$INSTALL_SCRIPT" -q -overwrite
rm -f "$INSTALL_SCRIPT"

cat <<EOF > /usr/local/esa-snap/etc/snap.properties
snap.jai.defaultTileSize=512
snap.jai.prefetchTiles=true
snap.log.level=ERROR
EOF

cat <<EOF > /usr/local/esa-snap/bin/gpt.vmoptions
-XX:MaxRAMPercentage=75.0
-Djava.awt.headless=true
-Dsnap.log.level=ERROR
EOF

# Fix SLF4J Warning
wget -nv -O /tmp/slf4j-simple-1.7.36.jar \
  https://repo1.maven.org/maven2/org/slf4j/slf4j-simple/1.7.36/slf4j-simple-1.7.36.jar
cp /tmp/slf4j-simple-1.7.36.jar /usr/local/esa-snap/snap/modules/
chmod a+r /usr/local/esa-snap/snap/modules/slf4j-simple-1.7.36.jar
rm /tmp/slf4j-simple-1.7.36.jar

chmod -R a+rX /usr/local/esa-snap/snap/modules
timeout 300 /usr/local/esa-snap/bin/snap \
  --nosplash \
  --nogui \
  --modules \
  --update-all \
  2>&1 | grep -v "INFO:.*ssl" || true
