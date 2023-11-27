#!/bin/bash
set -e

echo
echo "**************************"
echo "*** Installing Jupyter ***"
echo "**************************"
ln -sf /usr/local/bin/pip* /usr/bin/
export DISPLAY=:0.0
apt-get install -y libzmq3-dev
/usr/bin/python3 -m pip install jupyter
/usr/bin/python3 /usr/local/bin/jupyter-notebook --generate-config
/usr/bin/python3 -m pip install ipykernel==6.24.0
/usr/bin/python3 -m ipykernel install
R -e "pacman::p_load('IRkernel')"
R -e "IRkernel::installspec(user = FALSE)"

/usr/bin/python3 -m pip install jupyterlab==3.6.5
/usr/bin/python3 -m pip install ipywidgets==7.7.2 # https://github.com/voila-dashboards/voila/issues/1202#issuecomment-1255040572 until we wait.
/usr/bin/python3 -m pip install jupyterlab-language-pack-fr-FR
/usr/bin/python3 -m pip install jupyterlab-language-pack-es-ES
/usr/bin/python3 -m pip install folium
/usr/bin/python3 -m pip install ipyleaflet==0.17.3
/usr/bin/python3 -m pip install ipyvuetify==1.8.2
/usr/bin/python3 -m pip install lckr-jupyterlab-variableinspector
/usr/bin/python3 -m pip install sidecar

git clone https://github.com/ipython-contrib/jupyter_contrib_nbextensions.git
/usr/bin/python3 -m pip install jupyter_latex_envs # Required for jupyter_contrib_nbextensions
/usr/bin/python3 -m pip install -e jupyter_contrib_nbextensions
/usr/bin/python3 /usr/local/bin/jupyter contrib nbextension install
/usr/bin/python3 /usr/local/bin/jupyter nbextensions_configurator enable
/usr/bin/python3 /usr/local/bin/jupyter nbextension enable --py --sys-prefix widgetsnbextension

/usr/bin/python3 -m pip install voila
/usr/bin/python3 /usr/local/bin/jupyter nbextension install voila --sys-prefix --py
/usr/bin/python3 /usr/local/bin/jupyter nbextension enable voila --sys-prefix --py
/usr/bin/python3 /usr/local/bin/jupyter serverextension enable voila --sys-prefix

npm install -g --unsafe-perm ijavascript
npm install -g js-beautify
/usr/bin/ijsinstall --install=global


/usr/bin/python3 /usr/local/bin/jupyter lab build
