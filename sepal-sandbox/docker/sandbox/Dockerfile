FROM ubuntu:latest
MAINTAINER OpenForis


RUN apt-get update && apt-get install -y openssh-server supervisor gcc g++ gdal-bin libgdal1-dev libgsl0-dev libgsl0ldbl libproj-dev python-gdal python-scipy python-tk python-qt4 perl expect


RUN wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
RUN chmod u+x OpenForisToolkit.run


#RUN mkdir -p /var/run/sshd /home/sepal /home/sepal/.ssh
RUN mkdir -p /var/run/sshd /root/.ssh
#RUN chmod 700 /home/sepal/.ssh
RUN chmod 700 /root/.ssh
#RUN useradd -d /home/sepal -s /bin/bash sepal

#ADD authorized_keys /home/sepal/.ssh/
ADD authorized_keys /root/.ssh/

# RUN chown -R sepal:sepal /home/sepal/
#RUN chmod 600 /home/sepal/.ssh/authorized_keys
RUN chmod 600 /root/.ssh/authorized_keys

#RUN rm -rf /ect/pam.d/sshd
#ADD sshd /etc/pam.d/

ADD install_oft.sh .
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
RUN chmod u+x ./install_oft.sh

EXPOSE 22
CMD ["/usr/bin/supervisord"]
