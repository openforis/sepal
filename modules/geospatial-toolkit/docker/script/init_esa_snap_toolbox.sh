#!/bin/bash
set -e

echo
echo "***********************************"
echo "*** Installing ESA SNAP Toolbox ***"
echo "***********************************"
wget -nv http://step.esa.int/downloads/6.0/installers/esa-snap_sentinel_unix_6_0.sh
sh esa-snap_sentinel_unix_6_0.sh -q -overwrite
rm -f esa-snap_sentinel_unix_6_0.sh

echo ' Creating a simplified SNAP command line execution file with non-default runtime parameters'
echo '#!/bin/bash' > /usr/local/snap/bin/gpt.sepal
echo '' >> /usr/local/snap/bin/gpt.sepal
echo 'TOT_MEM=`free -m | awk '"'NR==2'"' | awk '"'{print "'$2'"}'"'`' >> /usr/local/snap/bin/gpt.sepal
echo '' >> /usr/local/snap/bin/gpt.sepal
echo 'if [[ TOT_MEM -gt 10000 ]] ;then ' >> /usr/local/snap/bin/gpt.sepal
echo '	HEAP_MEM=8192 ' >> /usr/local/snap/bin/gpt.sepal
echo '	echo $HEAP_MEM' >> /usr/local/snap/bin/gpt.sepal
echo 'else' >> /usr/local/snap/bin/gpt.sepal
echo '	HEAP_MEM=2048' >> /usr/local/snap/bin/gpt.sepal
echo '	echo $HEAP_MEM' >> /usr/local/snap/bin/gpt.sepal
echo 'fi' >> /usr/local/snap/bin/gpt.sepal
echo '' >> /usr/local/snap/bin/gpt.sepal
echo 'LD_LIBRARY_PATH=$LD_LIBRARY_PATH:. java \' >> /usr/local/snap/bin/gpt.sepal
echo ' -Djava.awt.headless=true\' >> /usr/local/snap/bin/gpt.sepal
echo ' -Dsnap.mainClass=org.esa.snap.core.gpf.main.GPT\' >> /usr/local/snap/bin/gpt.sepal
echo ' -Dsnap.home=/usr/local/snap\' >> /usr/local/snap/bin/gpt.sepal
echo ' -Xmx${HEAP_MEM}m\' >> /usr/local/snap/bin/gpt.sepal
echo ' -jar /usr/local/snap/snap/modules/ext/org.esa.snap.snap-core/org-esa-snap/snap-runtime.jar $@' >> /usr/local/snap/bin/gpt.sepal
chmod +x /usr/local/snap/bin/gpt.sepal

echo 'SNAP_EXE=/usr/local/snap/bin/gpt.sepal' | tee -a /etc/environment

snap --nosplash --nogui --modules --update-all
