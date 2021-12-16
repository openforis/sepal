FROM ubuntu:bionic

ENV MODULE_NAME user-storage-backup

ADD modules/${MODULE_NAME}/script /script
RUN chmod -R 500 /script && sync && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
