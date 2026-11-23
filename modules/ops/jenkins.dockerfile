FROM jenkins/jenkins:alpine-jdk25
USER root

ARG DEBIAN_FRONTEND=noninteractive
# ENV DOCKER_BUILDKIT=0
ARG DOCKER_COMPOSE_VERSION=v5.1.3
ARG DOCKER_BUILDX_VERSION=v0.33.0

# Where the build scripts of older branches, such as hotfix branches, keep their build output
RUN mkdir /var/log/sepal-build && chown jenkins: /var/log/sepal-build
RUN apk update && apk add --no-cache \
    coreutils \
    docker-cli \
    procps \
    python3 \
    rsync \
    sudo

# Install Docker Compose
RUN mkdir -p /usr/local/lib/docker/cli-plugins
RUN curl -SL https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
RUN chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Install docker buildx
RUN mkdir -p /usr/libexec/docker/cli-plugins
RUN curl -SL https://github.com/docker/buildx/releases/download/${DOCKER_BUILDX_VERSION}/buildx-${DOCKER_BUILDX_VERSION}.linux-amd64 -o /usr/libexec/docker/cli-plugins/docker-buildx
RUN chmod +x /usr/libexec/docker/cli-plugins/docker-buildx

USER jenkins

RUN jenkins-plugin-cli --plugins \
    ansicolor \
    collapsing-console-sections \
    configuration-as-code \
    github \
    git \
    git-parameter

# Skip Jenkins wizard
RUN echo 2.0 > /usr/share/jenkins/ref/jenkins.install.UpgradeWizard.state
ADD --chown=jenkins:jenkins config /var/lib/jenkins
RUN chmod 600 /var/lib/jenkins/.ssh/config

USER root
ADD /script/start-jenkins.sh /usr/local/sbin/start-jenkins
RUN chmod +x /usr/local/sbin/start-jenkins
ADD /script/sepal-build.sh /usr/local/bin/sepal-build
RUN chmod +x /usr/local/bin/sepal-build
ADD /script/registry_cleanup.py /script/registry_maintenance.py /usr/local/bin/
RUN chmod +x /usr/local/bin/registry_maintenance.py && ln -s /usr/local/bin/registry_maintenance.py /usr/local/bin/sepal-registry
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["/usr/local/sbin/start-jenkins"]
