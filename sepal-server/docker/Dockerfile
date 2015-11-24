FROM openforistoolkit

MAINTAINER OpenForis

ADD script/init_image.sh .
ADD script/init_container.sh .
ADD binary/sepal.jar /opt/sepal/bin/sepal.jar
RUN chmod u+x /init_image.sh
RUN chmod u+x /init_container.sh
RUN /init_image.sh

EXPOSE 1025

CMD ["/init_container.sh"]


