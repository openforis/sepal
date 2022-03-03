FROM ubuntu:focal

ENV MODULE_NAME mysql-backup

ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && sync && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
