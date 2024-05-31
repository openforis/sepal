FROM jenkins/jenkins:alpine-jdk21
USER root

ARG DEBIAN_FRONTEND=noninteractive
ENV DOCKER_BUILDKIT=0

RUN mkdir /var/log/sepal-build && chown jenkins: /var/log/sepal-build
RUN apk update && apk add --no-cache \
    coreutils \
    docker-cli \
    procps \
    rsync \
    sudo

# Install Docker Compose
RUN mkdir -p /usr/local/lib/docker/cli-plugins
RUN curl -SL https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
RUN chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

USER jenkins

RUN jenkins-plugin-cli --plugins \
    configuration-as-code \
    github \
    git \
    git-parameter

# Skip Jenkins wizard
RUN echo 2.0 > /usr/share/jenkins/ref/jenkins.install.UpgradeWizard.state
ADD --chown=jenkins:jenkins config /var/lib/jenkins
RUN chmod 600 /var/lib/jenkins/.ssh/config

USER root
ADD /script/init_container.sh /usr/local/sbin/init_container.sh
RUN chmod +x /usr/local/sbin/init_container.sh
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["/usr/local/sbin/init_container.sh"]
