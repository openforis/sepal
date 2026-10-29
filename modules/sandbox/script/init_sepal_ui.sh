#!/bin/bash
set -e

apt-get remove -y python3-blinker # We have conflicts with debian packages
uv pip uninstall --system earthengine-api # Ensure we get the forked version by re-installing
uv pip install --system -r /script/requirements.txt
