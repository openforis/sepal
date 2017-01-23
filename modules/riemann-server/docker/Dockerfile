FROM mnuessler/riemann
MAINTAINER OpenForis
EXPOSE 5555/udp 5555 5556

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config; sync && \
    /script/init_image.sh

ENTRYPOINT ["bash", "-c"]
CMD ["/script/init_container.sh"]