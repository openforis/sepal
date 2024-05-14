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






# EXPOSE 8080
# EXPOSE 5000


# ENV PROJECT_DIR /usr/local/src/sepal

# # Update and install base packages
# RUN apt-get update && apt-get install -y \
#     apt-utils \
#     curl \
#     ca-certificates \
#     git \
#     gnupg \
#     inetutils-ping \
#     lsb-release \
#     nano \
#     unzip \
#     zip


# # Install docker-cli
# RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
# RUN echo \
#     "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian \
#     $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
# RUN apt-get update && apt-get install -y docker-ce-cli

# # Install docker compose
# RUN mkdir -p /usr/local/lib/docker/cli-plugins
# RUN curl -SL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
# RUN chmod +x /usr/local/lib/docker/cli-plugins/docker-compose




# # # ADD script/init_image /
# # ADD script/init_container /
# # ADD script/jenkins.sh /
# # # ADD script/downloads /
# # ADD script/plugins.sh /usr/local/bin/plugins.sh
# # ADD config/plugins.txt /

# # RUN mkdir -p /usr/share/jenkins/ref/
# # ADD ref /usr/share/jenkins/ref/

# # ENV JENKINS_HOME /var/jenkins_home
# # ENV JENKINS_SLAVE_AGENT_PORT 50000
# # ENV JENKINS_UC https://updates.jenkins-ci.org
# # ENV JAVA_HOME /usr/local/lib/sdkman/candidates/java/current

# # # RUN chmod +x /init_image; sync; chmod +x /usr/local/bin/plugins.sh; sync;
# # # RUN /init_image
# # # RUN /downloads
# # RUN /usr/local/bin/plugins.sh /plugins.txt

# # VOLUME /var/jenkins_home

# # CMD ["/init_container"]
# CMD ["/usr/bin/sleep", '1d']