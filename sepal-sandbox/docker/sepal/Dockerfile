FROM openforis/jdk

MAINTAINER OpenForis

ADD script/init_image.sh .
RUN chmod u+x /init_image.sh
RUN /init_image.sh

EXPOSE 9999

CMD sudo -u sepal java -jar /opt/sepal/bin/sepal.jar > /var/log/sepal/out.log 2>&1

