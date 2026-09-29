# sshpiperd is built from source at a pinned commit; cmd/sshpiperd is its own Go module, so `go install` cannot
# fetch it and the commit check stands in for the checksum database.
FROM golang:1.27-trixie AS go-build
ENV CGO_ENABLED=0
ARG SSHPIPER_VERSION=v1.6.1
ARG SSHPIPER_COMMIT=ac26580901731efdf4eb9f12109f7ffff395798d
RUN git clone --quiet --depth 1 --branch ${SSHPIPER_VERSION} https://github.com/tg123/sshpiper.git /src/sshpiper \
    && test "$(git -C /src/sshpiper rev-parse HEAD)" = "${SSHPIPER_COMMIT}" \
    && cd /src/sshpiper/cmd/sshpiperd \
    && go build -o /out/sshpiperd -ldflags "-X main.mainver=${SSHPIPER_VERSION}" .

WORKDIR /src/router
ADD modules/ssh-gateway/router/go.mod modules/ssh-gateway/router/go.sum ./
RUN go mod download
ADD modules/ssh-gateway/router .
RUN go vet ./... && go test ./... && go build -o /out/sepal-router .

FROM node:26-trixie

EXPOSE 22

ARG DEBIAN_FRONTEND noninteractive
ENV MODULE_NAME ssh-gateway
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# install global packages
RUN npm install -g nodemon

COPY --from=go-build /out/sshpiperd /out/sepal-router /usr/local/bin/

# add scripts and configuration
ADD --chmod=755 modules/${MODULE_NAME}/script/* /usr/local/bin
ADD --chmod=755 modules/${MODULE_NAME}/config /config
RUN chmod 400 /config/*

# init image
RUN /usr/local/bin/init_image.sh

# install lib packages
WORKDIR ${SHARED}
ADD lib/js/shared .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

# install module packages
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/package.json .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

# add module source
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/src ./src

# run
USER root
CMD /usr/local/bin/init_container.sh
