FROM node:22-alpine

EXPOSE 80

ENV MODULE_NAME terminal
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# install global packages
RUN apk update && apk add net-tools sudo python3 g++ make openssh
RUN npm install -g nodemon

# configure sudoers
RUN cat <<EOF > /etc/sudoers.d/node
node ALL=(ALL) NOPASSWD:ALL
EOF
RUN chmod 0440 /etc/sudoers.d/node

# install lib packages
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
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/src ./src
ADD modules/${MODULE_NAME}/config ./config

# add scripts
ADD --chmod=0755 modules/${MODULE_NAME}/start.sh /usr/local/bin
ADD --chmod=0755 modules/${MODULE_NAME}/script/ssh_gateway.sh /usr/local/bin

# run
USER node
CMD start.sh
