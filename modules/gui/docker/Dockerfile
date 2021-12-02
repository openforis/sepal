FROM node:14-stretch
EXPOSE 7667
ARG BUILD_NUMBER
ARG GIT_COMMIT
ENV FRONTEND /usr/local/src/sepal/modules/gui/docker/frontend
ENV REACT_APP_GOOGLE_ANALYTICS_ID '${GOOGLE_ANALYTICS_ID}'
ENV REACT_APP_GOOGLE_MAPS_API_KEY '${GOOGLE_MAPS_API_KEY}'

USER root
RUN apt-get update && apt-get install -y \
  nginx \
  gettext

ADD frontend/package.json ${FRONTEND}/
WORKDIR ${FRONTEND}
RUN mkdir src
RUN npm install

ADD frontend ${FRONTEND}
RUN npm run build

ADD nginx.conf /etc/nginx/sites-enabled/default
ADD init_container.sh /usr/local/bin/init_container
RUN chmod 500 /usr/local/bin/init_container

CMD ["/usr/local/bin/init_container"]
