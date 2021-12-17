FROM node:14-stretch
EXPOSE 7667
ARG BUILD_NUMBER
ARG GIT_COMMIT
ENV MODULE_NAME gui
ENV MODULE /usr/local/src/sepal/modules/gui/frontend
ENV REACT_APP_GOOGLE_ANALYTICS_ID '${GOOGLE_ANALYTICS_ID}'
ENV REACT_APP_GOOGLE_MAPS_API_KEY '${GOOGLE_MAPS_API_KEY}'

USER root
RUN apt-get update && apt-get install -y \
  nginx \
  gettext

ADD modules/${MODULE_NAME}/frontend/package.json ${MODULE}/
WORKDIR ${MODULE}
RUN mkdir src
RUN npm install

ADD modules/${MODULE_NAME}/frontend ${MODULE}
RUN npm run build

ADD modules/${MODULE_NAME}/nginx.conf /etc/nginx/sites-enabled/default
ADD modules/${MODULE_NAME}/init_container.sh /usr/local/bin/init_container
RUN chmod 500 /usr/local/bin/init_container

CMD ["/usr/local/bin/init_container"]
