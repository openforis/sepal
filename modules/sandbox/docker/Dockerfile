FROM openforis/geospatial-toolkit
MAINTAINER OpenForis
ENV SEPAL_USERS_GRP_NAME sepalUsers

ADD config /config
ADD script /script
ADD templates /templates

RUN chmod -R 500 /script && \
    chmod -R 400 /config; sync && \
    /script/init_image.sh

ADD .build/sepal-ee /usr/local/src/sepal-ee
RUN pip3 install -e /usr/local/src/sepal-ee

CMD ["/script/init_container.sh"]
