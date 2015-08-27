FROM openforistoolkit
MAINTAINER OpenForis

RUN apt-get update && apt-get install -y openssh-server supervisor expect

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
RUN mkdir /var/run/sshd

EXPOSE 22
CMD ["/usr/bin/supervisord"]
