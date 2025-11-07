#!/bin/bash
set -e

echo
echo "**************************"
echo "*** Installing Jupyter ***"
echo "**************************"
ln -sf /usr/local/bin/pip* /usr/bin/
export DISPLAY=:0.0
apt-get update && apt-get install -y libzmq5-dev
/usr/bin/python3 -m pip install jupyter
/usr/bin/python3 /usr/local/bin/jupyter-notebook --generate-config
/usr/bin/python3 -m pip install ipykernel
/usr/bin/python3 -m ipykernel install

/usr/bin/python3 -m pip install jupyterlab
/usr/bin/python3 -m pip install jupyterlab-language-pack-fr-FR
/usr/bin/python3 -m pip install jupyterlab-language-pack-es-ES
/usr/bin/python3 -m pip install ipywidgets
/usr/bin/python3 -m pip install folium
/usr/bin/python3 -m pip install ipyleaflet
/usr/bin/python3 -m pip install jupyter-resource-usage

/usr/bin/python3 -m pip install ipyvuetify
/usr/bin/python3 -m pip install geemap
/usr/bin/python3 -m pip install ipecharts
/usr/bin/python3 -m pip install sidecar
/usr/bin/python3 -m pip install voila
