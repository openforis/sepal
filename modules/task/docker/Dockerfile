FROM ubuntu:bionic
EXPOSE 1026

ENV DEBIAN_FRONTEND=noninteractive
ENV TASK /usr/local/src/sepal/modules/task/docker
ENV JS_SHARED /usr/local/src/sepal/lib/js/shared
ENV PYTHON_SHARED /usr/local/src/sepal/lib/python/shared
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

RUN groupadd --gid 1000 node && \
    useradd --uid 1000 --gid node --shell /bin/bash --create-home node

ADD build/lib/js/shared ${JS_SHARED}
WORKDIR ${JS_SHARED}/js/shared
USER root
RUN chown -R node: ${JS_SHARED}
USER node
RUN npm install

ADD build/lib/python/shared ${PYTHON_SHARED}
RUN chmod +x ${PYTHON_SHARED}/stack_time_series.py && \
    ln -s ${PYTHON_SHARED}/stack_time_series.py /usr/local/bin/sepal-stack-time-series

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
