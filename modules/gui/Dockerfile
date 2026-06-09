# Build stage: compile the React app
FROM node:24-alpine AS build

ENV MODULE_NAME=gui
ENV MODULE=/usr/local/src/sepal/modules/gui
ENV SHARED=/usr/local/src/sepal/lib/js/shared

WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/.npmrc .
ADD modules/${MODULE_NAME}/package.json .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

ADD modules/${MODULE_NAME}/src ./src
ADD modules/${MODULE_NAME}/public ./public
ADD modules/${MODULE_NAME}/.env ./.env
ADD modules/${MODULE_NAME}/jsconfig.json ./jsconfig.json
ADD modules/${MODULE_NAME}/index.html ./index.html
ADD modules/${MODULE_NAME}/vite.config.js ./vite.config.js

# shared library source, resolved by the #sepal/* alias in vite.config.js
ADD lib/js/shared/src ${SHARED}/src

ARG BUILD_NUMBER
ENV BUILD_NUMBER=$BUILD_NUMBER
ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT

RUN npm run build

ADD --chmod=0755 modules/${MODULE_NAME}/start.sh /usr/local/bin/start.sh

EXPOSE 80
CMD ["/usr/local/bin/start.sh"]

# Runtime stage: serve the static dist with unprivileged nginx
FROM nginxinc/nginx-unprivileged:alpine

ENV MODULE_NAME=gui
ENV MODULE=/usr/local/src/sepal/modules/gui

COPY --chown=nginx:nginx modules/gui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=build ${MODULE}/dist ${MODULE}/dist
COPY --chmod=0755 modules/gui/template-html.sh /docker-entrypoint.d/90-template-html.sh

ARG BUILD_NUMBER
ENV BUILD_NUMBER=$BUILD_NUMBER
ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT

EXPOSE 80
# Inherits ENTRYPOINT and CMD from nginxinc/nginx-unprivileged:alpine:
# /docker-entrypoint.sh runs /docker-entrypoint.d/*.sh, then execs nginx -g 'daemon off;'
