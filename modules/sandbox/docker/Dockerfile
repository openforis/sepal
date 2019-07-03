FROM openforis/geospatial-toolkit
MAINTAINER OpenForis
ENV SEPAL_USERS_GRP_NAME sepalUsers

ADD config /config
ADD script /script
ADD templates /templates

RUN chmod +x /usr/local/bin/*; sync && chmod -R 400 /config; sync && mkdir /script

ADD script/init_image.sh /script
RUN chmod u+x /script/init_image.sh; sync && /script/init_image.sh

ADD script/init_rstudio.sh /script
RUN chmod u+x /script/init_rstudio.sh; sync && /script/init_rstudio.sh

ADD script/init_shiny_server.sh /script
RUN chmod u+x /script/init_shiny_server.sh; sync && /script/init_shiny_server.sh


ADD script/init_jupyter.sh /script
RUN chmod u+x /script/init_jupyter.sh; sync && /script/init_jupyter.sh

ADD .build/sepal-ee /usr/local/src/sepal-ee
RUN pip3 install -e /usr/local/src/sepal-ee
RUN pip2 install -e /usr/local/src/sepal-ee

CMD ["/script/init_container.sh"]
