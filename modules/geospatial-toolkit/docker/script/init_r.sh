#!/bin/bash
set -e

echo
echo "********************"
echo "*** Installing R ***"
echo "********************"

apt-get install -y\
 r-base-core=3.3.3-1xenial0\
 r-base-dev=3.3.3-1xenial0\
