FROM openforis/jdk

MAINTAINER OpenForis


ADD script/init_image .

RUN chmod +x /init_image

RUN /init_image

CMD ["/bin/bash"]