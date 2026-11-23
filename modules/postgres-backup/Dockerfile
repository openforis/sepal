FROM postgres:18.6-trixie

ENV MODULE_NAME postgres-backup

ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && sync && \
    /script/init_image.sh

ENTRYPOINT []
CMD ["/script/init_container.sh"]
