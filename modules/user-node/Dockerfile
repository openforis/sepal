FROM node:26-alpine

ENV MODULE_NAME user-node
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# install global packages
RUN apk update && apk add curl sudo openssh-keygen
RUN npm install -g nodemon

# install lib/shared packages
WORKDIR ${SHARED}
ADD lib/js/shared .
ADD modules/${MODULE_NAME}/lib/shared/package-lock.json .
RUN npm install

# install module packages
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/package.json .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

# add module source
ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/config ${MODULE}/config
ADD modules/${MODULE_NAME}/migrations ${MODULE}/migrations

# add shell scripts
ADD --chmod=0755 modules/${MODULE_NAME}/start.sh /usr/local/bin/start.sh

# privileged provisioning scripts (invoked by the non-root node user via sudo)
ADD --chmod=0755 modules/${MODULE_NAME}/script/provision-user /usr/local/bin/provision-user
ADD --chmod=0755 modules/${MODULE_NAME}/script/deprovision-user /usr/local/bin/deprovision-user
ADD --chmod=0755 modules/${MODULE_NAME}/script/save-credentials /usr/local/bin/save-credentials
ADD --chmod=0755 modules/${MODULE_NAME}/script/delete-credentials /usr/local/bin/delete-credentials
RUN printf '%s\n' 'node ALL=(root) NOPASSWD: /usr/local/bin/provision-user, /usr/local/bin/deprovision-user, /usr/local/bin/save-credentials, /usr/local/bin/delete-credentials' > /etc/sudoers.d/user-node \
    && chmod 0440 /etc/sudoers.d/user-node

# run
USER node
CMD /usr/local/bin/start.sh
