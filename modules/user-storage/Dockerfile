FROM node:22-alpine

ENV MODULE_NAME user-storage
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# install global packages
RUN apk update && apk add curl sudo
RUN npm install -g nodemon

# install sharkdp/diskus
RUN curl -Lo /tmp/diskus.tar.gz https://github.com/sharkdp/diskus/releases/download/v0.8.0/diskus-v0.8.0-x86_64-unknown-linux-musl.tar.gz
RUN tar xf /tmp/diskus.tar.gz -C /usr/local/lib
RUN ln -s /usr/local/lib/diskus-v0.8.0-x86_64-unknown-linux-musl/diskus /usr/local/bin/
RUN rm /tmp/diskus.tar.gz

# install sharkdp/fd
RUN curl -Lo /tmp/fd.tar.gz https://github.com/sharkdp/fd/releases/download/v10.3.0/fd-v10.3.0-x86_64-unknown-linux-musl.tar.gz
RUN tar xf /tmp/fd.tar.gz -C /usr/local/lib
RUN ln -s /usr/local/lib/fd-v10.3.0-x86_64-unknown-linux-musl/fd /usr/local/bin/
RUN rm /tmp/fd.tar.gz

# create fix_sepal_users_permissions
RUN cat <<EOF > /usr/local/bin/fix_sepal_users_permissions
#!/bin/sh
chmod +rx /sepalUsers
EOF
RUN chmod 0755 /usr/local/bin/fix_sepal_users_permissions

# add sudoers
RUN cat <<EOF > /etc/sudoers.d/node
node ALL=(root) NOPASSWD: /usr/bin/find
node ALL=(root) NOPASSWD: /usr/local/bin/diskus
node ALL=(root) NOPASSWD: /usr/local/bin/fix_sepal_users_permissions
EOF
RUN chmod 0440 /etc/sudoers.d/node

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

# add shell scripts
ADD --chmod=0755 modules/${MODULE_NAME}/start.sh /usr/local/bin/start.sh

# run
USER node
CMD /usr/local/bin/start.sh
