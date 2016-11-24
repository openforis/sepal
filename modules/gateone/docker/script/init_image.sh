#!/usr/bin/env bash

apt-get update -y && apt-get install -y \
    gettext

rm -rf /gateone/GateOne/gateone/applications/example
rm -rf /gateone/GateOne/gateone/applications/terminal/plugins/example
rm -rf /gateone/GateOne/gateone/applications/terminal/plugins/playback

rm -rf /usr/local/lib/python2.7/dist-packages/gateone-1.2.0-py2.7.egg/gateone/applications/example
rm -rf /usr/local/lib/python2.7/dist-packages/gateone-1.2.0-py2.7.egg/gateone/applications/terminal/plugins/example
rm -rf /usr/local/lib/python2.7/dist-packages/gateone-1.2.0-py2.7.egg/gateone/applications/terminal/plugins/playback
