FROM ubuntu:bionic
EXPOSE 1026

ENV DEBIAN_FRONTEND=noninteractive
ENV TASK /usr/local/src/sepal/modules/task/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared
RUN apt-get update && apt-get install -y \
  curl \
  gettext \
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
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD package.json ${TASK}/
WORKDIR ${TASK}
USER root
RUN mkdir src && chown -R node: ${TASK}
USER node
RUN npm install

USER root
ADD src ${TASK}/src
ADD script /script
RUN chmod -R 500 /script && sync

CMD ["/script/init_container.sh"]
