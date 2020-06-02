FROM node:14-stretch
EXPOSE 1026

ENV TASK /usr/local/src/sepal/modules/task/docker
ENV RXJS /usr/local/src/sepal/lib/js/rxjs
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN apt-get update && apt-get install -y sudo

ADD build/lib/js/rxjs ${RXJS}
WORKDIR ${RXJS}
USER root
RUN chown -R node: ${RXJS}
USER node
RUN npm install

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
