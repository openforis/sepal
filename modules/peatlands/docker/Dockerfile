FROM ubuntu:xenial
MAINTAINER OpenForis
EXPOSE 7767

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config; sync && \
    /script/init_image.sh

ADD requirements.txt /requirements.txt
RUN pip install -r /requirements.txt --system-site-packages

ADD src /src

RUN cd /src/peatlands/static && \
    ln -s /usr/bin/nodejs /usr/bin/node && \
    yarn install

CMD ["/script/init_container.sh"]
