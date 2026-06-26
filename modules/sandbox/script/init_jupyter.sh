#!/bin/bash
set -e

echo
echo "**************************"
echo "*** Installing Jupyter ***"
echo "**************************"
ln -sf /usr/local/bin/pip* /usr/bin/
export DISPLAY=:0.0
apt-get update && apt-get install -y libzmq5-dev
uv pip install --system \
    jupyter \
    ipykernel \
    jupyterlab \
    jupyterlab-language-pack-fr-FR \
    jupyterlab-language-pack-es-ES \
    ipywidgets \
    folium \
    ipyleaflet \
    jupyter-resource-usage \
    ipyvuetify \
    geemap \
    ipecharts \
    sidecar \
    voila==0.5.11 # this version has to match with the one in app-manager module Dockerfile

/usr/bin/python3 /usr/local/bin/jupyter-notebook --generate-config
/usr/bin/python3 -m ipykernel install
