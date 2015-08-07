FROM liftoff/gateone:latest
MAINTAINER OpenForis

RUN mkdir -p /gateone/users/ANONYMOUS /gateone/users/ANONYMOUS/.ssh

ADD .default_ids /gateone/users/ANONYMOUS/.ssh/
ADD id_rsa /gateone/users/ANONYMOUS/.ssh/

EXPOSE 8000
CMD ["/usr/local/bin/update_and_run_gateone --origins=*"]
