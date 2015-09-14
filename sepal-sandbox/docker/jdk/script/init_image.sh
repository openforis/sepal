#!/usr/bin/env bash


#install base package
apt-get update && apt-get install  -y software-properties-common

#install java-8
\
  echo oracle-java8-installer shared/accepted-oracle-license-v1-1 select true | debconf-set-selections && \
  add-apt-repository -y ppa:webupd8team/java && \
  apt-get update && \
  apt-get install -y oracle-java8-installer && \
  rm -rf /var/lib/apt/lists/* && \
  rm -rf /var/cache/oracle-jdk8-installer

echo "JAVA_HOME=\"/usr/lib/jvm/java-8-oracle\"" >> /etc/environment
