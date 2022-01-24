FROM ubuntu:bionic
EXPOSE 1026

ENV DEBIAN_FRONTEND=noninteractive
ENV MODULE_NAME task
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
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
    curl -fsSL https://deb.nodesource.com/setup_14.x | bash -
RUN apt-get update && apt-get install -y \
    gdal-bin \
    nodejs

RUN groupadd --gid 1000 node && \
    useradd --uid 1000 --gid node --shell /bin/bash --create-home node

RUN npm install -g nodemon

ADD lib/js/shared ${JS_SHARED}
WORKDIR ${JS_SHARED}/js/shared
USER root
ADD lib/python/shared ${PYTHON_SHARED}
RUN chmod +x ${PYTHON_SHARED}/stack_time_series.py && \
    ln -s ${PYTHON_SHARED}/stack_time_series.py /usr/local/bin/sepal-stack-time-series
RUN chown -R node: ${JS_SHARED}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

USER root
ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/wait_until_initialized.sh /usr/local/bin
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin
RUN chmod +x -R /usr/local/bin && sync
CMD start.sh
