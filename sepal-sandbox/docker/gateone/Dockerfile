FROM liftoff/gateone:latest
MAINTAINER OpenForis


RUN mkdir -p /keygen/

ADD conf/30api_keys.conf /etc/gateone/conf.d/
ADD script/keygen.run /keygen/
ADD script/init_image.sh .
ADD conf/config /keygen/

RUN chmod u+x /init_image.sh
RUN ./init_image.sh

CMD /usr/local/bin/update_and_run_gateone --origins=* --auth=api
