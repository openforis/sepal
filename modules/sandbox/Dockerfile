FROM openforis/geospatial-toolkit

ENV MODULE_NAME sandbox
ENV SEPAL_USERS_GRP_NAME sepalUsers
ENV VERSION 2021-09-07

ADD modules/${MODULE_NAME}/templates /templates

RUN chmod +x /usr/local/bin/* && sync && sync && mkdir -p /script

ADD modules/${MODULE_NAME}/script/init_image.sh /script/
RUN chmod u+x /script/init_image.sh && sync && /script/init_image.sh

ADD modules/${MODULE_NAME}/script/init_dggrid.sh /script/
RUN chmod u+x /script/init_dggrid.sh && sync && /script/init_dggrid.sh

ADD modules/${MODULE_NAME}/script/init_rstudio.sh /script/
RUN chmod u+x /script/init_rstudio.sh && sync && /script/init_rstudio.sh

ADD modules/${MODULE_NAME}/script/init_shiny_server.sh /script/
RUN chmod u+x /script/init_shiny_server.sh && sync && /script/init_shiny_server.sh

ADD modules/${MODULE_NAME}/script/init_jupyter.sh /script/
RUN chmod u+x /script/init_jupyter.sh && sync && /script/init_jupyter.sh

ADD modules/${MODULE_NAME}/script /script
RUN chmod -R 500 /script

ADD lib /usr/local/lib/sepal
RUN chmod +x /usr/local/lib/sepal/python/shared/stack_time_series.py && \
    ln -s /usr/local/lib/sepal/python/shared/stack_time_series.py /usr/local/bin/sepal-stack-time-series

ADD modules/${MODULE_NAME}/script/init_ost.sh /script/
RUN chmod u+x /script/init_ost.sh && sync && /script/init_ost.sh

RUN apt-get update && apt-get install -y htop

ADD modules/${MODULE_NAME}/script/init_sepal_ui.sh /script/
RUN chmod u+x /script/init_sepal_ui.sh && sync && /script/init_sepal_ui.sh

CMD ["/script/init_container.sh"]
