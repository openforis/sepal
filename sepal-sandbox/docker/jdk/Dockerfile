FROM ubuntu:trusty

MAINTAINER OpenForis

ADD script/init_image.sh /

RUN chmod u+x ./init_image.sh
RUN ./init_image.sh

ENV JAVA_HOME /usr/lib/jvm/java-8-oracle

CMD ["bash"]
