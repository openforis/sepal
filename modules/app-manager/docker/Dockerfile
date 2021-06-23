FROM ubuntu:bionic
EXPOSE 5011

ENV DEBIAN_FRONTEND noninteractive
ENV MODULE /usr/local/src/sepal/modules/app-manager/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

ADD kernels /etc/sepal/app-manager/kernels-templates

RUN apt update && apt install -y \
    curl \
    git \
    python3 \
    python3-venv \
    sudo

RUN adduser node && adduser node sudo && echo 'node      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

USER node
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
RUN bash -c "source /home/node/.nvm/nvm.sh && nvm install node stable"

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
