FROM openforistoolkit
MAINTAINER OpenForis
EXPOSE 22, 8787

ADD script/init_image.sh .

RUN chmod u+x /init_image.sh
RUN /init_image.sh


CMD ["/usr/bin/supervisord"]
