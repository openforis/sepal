FROM osixia/openldap:1.2.4

EXPOSE 389 636

ENV MODULE_NAME ldap

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

ENTRYPOINT []
CMD ["/script/init_container.sh"]
