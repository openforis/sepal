#!/bin/bash
set -e

apt remove -y python3-blinker # We have conflicts with debian packages
python3 -m pip uninstall -y earthengine-api # Ensure we get the forked version by re-installing
uv pip install --system -r /script/requirements.txt
