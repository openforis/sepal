#!/bin/bash
set -e

echo
echo "**************************"
echo "*** Installing Jupyter ***"
echo "**************************"
/usr/bin/python3 -m pip install jupyter
/usr/bin/python3 /usr/local/bin/jupyter-notebook --generate-config
/usr/bin/python3 -m pip install ipykernel
/usr/bin/python3 -m ipykernel install
/usr/bin/python2 -m pip install ipykernel
/usr/bin/python2 -m ipykernel install
R -e "pacman::p_load('IRkernel')"
R -e "IRkernel::installspec(user = FALSE)"
/usr/bin/python3 -m pip install ipywidgets
/usr/bin/python2 -m pip install ipywidgets
/usr/bin/python3 -m pip install jupyterlab
/usr/bin/python3 -m pip install folium
/usr/bin/python2 -m pip install folium
git clone https://github.com/ipython-contrib/jupyter_contrib_nbextensions.git
/usr/bin/python3 -m pip install -e jupyter_contrib_nbextensions
/usr/bin/python3 /usr/local/bin/jupyter contrib nbextension install
/usr/bin/python3 /usr/local/bin/jupyter nbextensions_configurator enable
/usr/bin/python3 /usr/local/bin/jupyter nbextension enable --py --sys-prefix widgetsnbextension
