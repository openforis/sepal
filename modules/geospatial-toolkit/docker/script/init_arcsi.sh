#!/bin/bash

echo
echo "************************"
echo "*** Installing ARCSI ***"
echo "************************"
# (ARCSI requires older GDAL and OpenSSL versions, so a separate environment is created for ARCSI)
/opt/miniconda3/bin/conda create -y -n arcsi python=3.4
/opt/miniconda3/bin/conda install -y -n arcsi -c au-eoed arcsi
/opt/miniconda3/bin/conda install -y -n arcsi krb5
/opt/miniconda3/bin/conda update -y -n arcsi scipy
