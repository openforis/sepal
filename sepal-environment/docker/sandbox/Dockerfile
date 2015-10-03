FROM openforistoolkit:graphical-tools
MAINTAINER OpenForis


ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD script/init_sandbox.run .
ADD script/init_image.sh .
ADD script/waitforssh.sh .


RUN chmod u+x /init_image.sh
RUN ./init_image.sh

CMD ["/usr/bin/supervisord"]
