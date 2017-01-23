FROM sebp/elk
MAINTAINER OpenForis

EXPOSE 25826 5601

ADD config /config
ADD script /script

RUN chmod -R 400 /config && \
    chmod -R 500 /script; sync && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]