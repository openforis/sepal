FROM liftoff/gateone:latest
MAINTAINER OpenForis

RUN mkdir -p /keygen/

ADD 30api_keys.conf /etc/gateone/conf.d/
ADD keygen.run /keygen/
ADD config /keygen/
RUN chmod u+x /keygen/keygen.run

EXPOSE 8000
CMD /usr/local/bin/update_and_run_gateone --origins=* --auth=api
