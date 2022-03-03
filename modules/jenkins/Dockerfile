FROM ubuntu:focal

EXPOSE 8080
EXPOSE 5000

ENV MODULE_NAME jenkins

ADD modules/${MODULE_NAME}/script/init_image .
ADD modules/${MODULE_NAME}/script/init_container .
ADD modules/${MODULE_NAME}/script/jenkins.sh .
ADD modules/${MODULE_NAME}/script/downloads .
ADD modules/${MODULE_NAME}/script/plugins.sh /usr/local/bin/plugins.sh
ADD modules/${MODULE_NAME}/config/plugins.txt .

RUN mkdir -p /usr/share/jenkins/ref/
ADD modules/${MODULE_NAME}/ref /usr/share/jenkins/ref/

ENV JENKINS_HOME /var/jenkins_home
ENV JENKINS_SLAVE_AGENT_PORT 50000
ENV JENKINS_UC https://updates.jenkins-ci.org
ENV JAVA_HOME /usr/local/lib/sdkman/candidates/java/current

RUN chmod +x /init_image; sync; chmod +x /usr/local/bin/plugins.sh; sync;
RUN /init_image
RUN /downloads
RUN /usr/local/bin/plugins.sh /plugins.txt

VOLUME /var/jenkins_home

CMD ["/init_container"]
