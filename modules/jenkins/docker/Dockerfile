FROM ubuntu:trusty
MAINTAINER OpenForis
EXPOSE 8080
EXPOSE 5000

ADD script/init_image .
ADD script/init_container .
ADD script/jenkins.sh .
ADD script/downloads .
ADD script/plugins.sh /usr/local/bin/plugins.sh
ADD config/plugins.txt .

RUN mkdir -p /usr/share/jenkins/ref/
ADD ref /usr/share/jenkins/ref/

ENV JENKINS_HOME /var/jenkins_home
ENV JENKINS_SLAVE_AGENT_PORT 50000
ENV JENKINS_UC https://updates.jenkins-ci.org
ENV JAVA_HOME /usr/lib/jvm/java-8-oracle

RUN chmod +x /init_image
RUN /init_image
RUN /downloads
RUN /usr/local/bin/plugins.sh /plugins.txt

ADD config/settings.xml /etc/maven/settings.xml

VOLUME /var/jenkins_home

CMD ["/init_container"]
