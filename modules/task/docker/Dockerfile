FROM ubuntu:bionic
EXPOSE 1026

ENV DEBIAN_FRONTEND=noninteractive
ENV TASK /usr/local/src/sepal/modules/task/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared
RUN apt-get update && apt-get install -y \
  curl \
  gettext \
  git \
  python3 \
  python3-gdal \
  python3-pip \
  gdal-bin \
  software-properties-common \
  sudo \
  zip
RUN apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y && \
    curl -sL https://deb.nodesource.com/setup_14.x | bash -
RUN apt-get update && apt-get install -y \
    gdal-bin \
    nodejs

ADD build/lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
RUN npm install

ADD package.json ${TASK}/
WORKDIR ${TASK}
RUN mkdir src
RUN npm install

ADD src ${TASK}/src
ADD script /script
RUN chmod -R 500 /script && sync

CMD ["/script/init_container.sh"]
