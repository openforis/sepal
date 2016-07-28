FROM sebp/elk
MAINTAINER OpenForis
ENV LS_OPTS --auto-reload --reload-interval 2
ADD config /config
ADD script /script

RUN chmod -R 400 /config && \
    chmod -R 500 /script && \
    /script/init_image.sh

ENTRYPOINT ["/script/init_container.sh"]