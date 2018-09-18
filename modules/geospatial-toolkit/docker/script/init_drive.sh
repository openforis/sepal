#!/bin/bash
set -e

echo
echo "************************"
echo "*** Installing Drive ***"
echo "************************"

wget -nv https://github.com/odeke-em/drive/releases/download/v0.3.9/drive_linux
chmod +x drive_linux
cp drive_linux /usr/bin/drive
