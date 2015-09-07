FROM ubuntu
MAINTAINER OpenForis

RUN apt-get update && apt-get install -y wget curl  gcc g++ gdal-bin libgdal1-dev libgsl0-dev libgsl0ldbl libproj-dev python-gdal python-scipy python-tk python-qt4 perl
RUN wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
RUN chmod u+x OpenForisToolkit.run
RUN ./OpenForisToolkit.run << 1

RUN wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
RUN chmod u+x Miniconda3-latest-Linux-x86_64.sh
RUN ./Miniconda3-latest-Linux-x86_64.sh -b
RUN /root/miniconda3/bin/conda install -y -c https://conda.binstar.org/osgeo arcsi

ENV GDAL_DRIVER_PATH="/root/miniconda3/lib/gdalplugins:$GDAL_DRIVER_PATH"
ENV GDAL_DATA="/root/miniconda3/share/gdal"
ENV PATH="$PATH:/root/miniconda3/bin"


CMD ["/bin/bash"]
