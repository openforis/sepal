#!/bin/bash
set -e

echo
echo "**********************************************"
echo "*** Installing biota, sen2mosaic, deforest ***"
echo "**********************************************"

# The clones stay in /usr/local/lib: their cli/ scripts are run from there.
cd /usr/local/lib
git clone --depth 1 https://github.com/dfguerrerom/biota
git clone --depth 1 https://github.com/smfm-project/sen2mosaic.git
git clone --depth 1 https://github.com/smfm-project/deforest.git
uv pip install --system ./biota ./sen2mosaic ./deforest
