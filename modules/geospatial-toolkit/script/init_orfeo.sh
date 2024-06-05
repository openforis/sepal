#!/bin/bash
set -e

echo
echo "********************************"
echo "*** Installing Orfeo ToolBox ***"
echo "********************************"

otb=OTB-9.0.0-Linux.tar.gz
curl https://www.orfeo-toolbox.org/packages/archives/OTB/$otb -o /tmp/$otb
mkdir -p /usr/local/lib/orfeo
tar xf /tmp/$otb --one-top-level=/usr/local/lib/orfeo
(cd /usr/local/lib/orfeo; source ./otbenv.profile)
