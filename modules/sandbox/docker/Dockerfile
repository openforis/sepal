FROM openforis/geospatial-toolkit
MAINTAINER OpenForis
ENV SEPAL_USERS_GRP_NAME sepalUsers

ADD config /config
ADD script /script
ADD templates /templates

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

ADD geo-web-viz /usr/local/lib/geo-web-viz
RUN pip install -r /usr/local/lib/geo-web-viz/requirements.txt

CMD ["/script/init_container.sh"]
