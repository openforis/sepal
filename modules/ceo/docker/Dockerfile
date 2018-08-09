FROM ubuntu:xenial
MAINTAINER OpenForis
EXPOSE 7766

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config; sync && \
    /script/init_image.sh

ADD requirements.txt /requirements.txt
RUN pip2 install -r /requirements.txt

ADD src /src

RUN cd /src/ceo/static && \
    yarn install

CMD ["/script/init_container.sh"]
