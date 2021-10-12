FROM ubuntu:focal
EXPOSE 5011

ENV DEBIAN_FRONTEND noninteractive
ENV MODULE /usr/local/src/sepal/modules/app-manager/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

ADD install-requirements.sh /usr/local/bin/install-requirements
RUN chmod +x /usr/local/bin/install-requirements
ADD kernels /etc/sepal/app-manager/kernels-templates

RUN apt update && apt install -y \
    curl \
    gcc \
    git \
    libpq-dev \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    python3-wheel \
    software-properties-common \
    sudo

RUN apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y

RUN apt-get update && apt-get install -y \
    libgdal-dev \
    gdal-bin \
    python3-gdal

RUN pip3 install --upgrade pip

RUN adduser node && adduser node sudo && echo 'node      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

USER node
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
RUN bash -c "source /home/node/.nvm/nvm.sh && nvm install node 14"

ADD build/lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN bash -c "source /home/node/.nvm/nvm.sh && npm install"

ADD package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN bash -c "source /home/node/.nvm/nvm.sh && npm install"

ADD src ${MODULE}/src
CMD bash -c "sudo cp -rn /etc/sepal/app-manager/kernels-templates/* /usr/local/share/jupyter/kernels/ && source /home/node/.nvm/nvm.sh && node src/main.js"
