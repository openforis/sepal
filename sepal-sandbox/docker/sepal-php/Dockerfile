FROM linode/lamp
MAINTAINER OpenForis
RUN apt-get update && apt-get install -y curl wget php5-mcrypt openssh-server supervisor libssh2-1-dev libssh2-php php5-curl php5-gd php5-mysql
RUN wget -O "sepal-php.tar.gz"  "http://openforis.org/nexus/service/local/artifact/maven/redirect?r=public&g=org.openforis.sepal&a=sepal-php&v=1.0.0-SNAPSHOT&e=tgz"   
RUN tar -zxvf sepal-php.tar.gz -C /var/www/html/
RUN chown -R www-data:www-data /var/www/html
RUN sudo chmod 775 /var/www/html/app/config/lsat_geoserver_fix.sh
RUN sudo chmod -R 775 /var/www/html/app/config/processing-scripts/

RUN mkdir /etc/apache2/ssl
ADD fao-dm.ca-bundle /etc/apache2/ssl/
ADD fao-dm_org.crt /etc/apache2/ssl/
ADD server.key /etc/apache2/ssl/

RUN rm -rf /etc/apache2/sites-available
RUN rm -rf /etc/apache2/sites-enabled
RUN mkdir /etc/apache2/sites-enabled
RUN mkdir /etc/apache2/sites-available
ADD 000-default.conf /etc/apache2/sites-available/
ADD default-ssl.conf /etc/apache2/sites-available/

RUN ln -s /etc/apache2/sites-available/000-default.conf /etc/apache2/sites-enabled/
RUN ln -s /etc/apache2/sites-available/default-ssl.conf /etc/apache2/sites-enabled/
RUN php5enmod mcrypt
RUN a2enmod rewrite
RUN a2enmod ssl

VOLUME /data/home/
VOLUME /etc/sdms/

RUN useradd sdms-admin -d "/data/home/sdms-admin"
RUN echo sdms-admin:sdms-admin | chpasswd
RUN groupadd -g 9999 sepal
RUN usermod -aG sepal www-data

RUN mkdir /var/run/sshd

COPY init.sh .
COPY schema.sql .
RUN chmod u+x init.sh
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord"]
