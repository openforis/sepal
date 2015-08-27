FROM ubuntu
MAINTAINER OpenForis


RUN apt-get update && apt-get install -y wget  gcc g++ gdal-bin libgdal1-dev libgsl0-dev libgsl0ldbl libproj-dev python-gdal python-scipy python-tk python-qt4 perl


RUN wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
RUN chmod u+x OpenForisToolkit.run

ADD install_oft.sh .


RUN chmod u+x ./install_oft.sh
RUN ./OpenForisToolkit.run << 1
EXPOSE 22
CMD ["/bin/bash"]
