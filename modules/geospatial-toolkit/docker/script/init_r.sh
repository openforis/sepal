#!/bin/bash
set -e

echo
echo "********************"
echo "*** Installing R ***"
echo "********************"

apt-get install -y\
 r-base\
 r-base-dev
