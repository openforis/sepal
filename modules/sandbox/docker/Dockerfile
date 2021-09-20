FROM openforis/geospatial-toolkit
MAINTAINER OpenForis
ENV SEPAL_USERS_GRP_NAME sepalUsers
ENV VERSION 2021-09-07

ADD config /config
ADD templates /templates

RUN chmod +x /usr/local/bin/* && sync && chmod -R 400 /config && sync && mkdir -p /script

ADD script/init_image.sh /script/
RUN chmod u+x /script/init_image.sh && sync && /script/init_image.sh

ADD script/init_rstudio.sh /script/
RUN chmod u+x /script/init_rstudio.sh && sync && /script/init_rstudio.sh

ADD script/init_shiny_server.sh /script/
RUN chmod u+x /script/init_shiny_server.sh && sync && /script/init_shiny_server.sh

ADD script/init_jupyter.sh /script/
RUN chmod u+x /script/init_jupyter.sh && sync && /script/init_jupyter.sh

ADD script /script
RUN chmod -R 500 /script

ADD build/lib /usr/local/lib/sepal
RUN chmod +x /usr/local/lib/sepal/python/shared/stack_time_series.py && \
    ln -s /usr/local/lib/sepal/python/shared/stack_time_series.py /usr/local/bin/sepal-stack-time-series

ADD script/init_osk.sh /script/
RUN chmod u+x /script/init_osk.sh && sync && /script/init_osk.sh

ADD script/init_sepal_ui.sh /script/
RUN chmod u+x /script/init_sepal_ui.sh && sync && /script/init_sepal_ui.sh

CMD ["/script/init_container.sh"]
