FROM node:16-stretch
EXPOSE 5999

ENV MODULE /usr/local/src/sepal/modules/user-storage/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

# Install diskus
# RUN wget -q https://github.com/sharkdp/diskus/releases/download/v0.6.0/diskus_0.6.0_amd64.deb
# RUN dpkg -i diskus_0.6.0_amd64.deb && rm diskus_0.6.0_amd64.deb

# RUN groupadd --gid 9999 sepal && adduser node sepal
# RUN apt update && \
#     apt install sudo && \
#     adduser node sudo && \
#     echo 'node ALL = (root) NOPASSWD: /usr/bin/diskus' >> /etc/sudoers

ADD build/lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

ADD src ${MODULE}/src
CMD node \
    src/main.js \
    --home-dir /sepalUsers \
    --poll-interval-milliseconds ${POLL_INTERVAL_MS}
