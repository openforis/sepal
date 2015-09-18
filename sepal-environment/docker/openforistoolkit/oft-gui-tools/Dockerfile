FROM openforistoolkit
MAINTAINER OpenForis

ADD script/init_image.sh .


RUN chmod u+x /init_image.sh
RUN /init_image.sh


CMD ["/usr/bin/supervisord"]
