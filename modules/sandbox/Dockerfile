FROM openforis/sandbox-base

ENV MODULE_NAME sandbox
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current \
    SDKMAN_DIR=/usr/local/lib/sdkman \
    GDAL_DATA=/usr/share/gdal

ENV DEBIAN_FRONTEND noninteractive

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/config/OFGTMethod /usr/local/share/OFGTMethod

RUN chmod -R 400 /config && sync

ADD modules/${MODULE_NAME}/script/init_oft.sh /script/
RUN chmod u+x /script/init_oft.sh && sync && /script/init_oft.sh

ADD modules/${MODULE_NAME}/script/init_esa_snap_toolbox.sh /script/
RUN chmod u+x /script/init_esa_snap_toolbox.sh && sync && /script/init_esa_snap_toolbox.sh

ADD modules/${MODULE_NAME}/script/init_gmt.sh /script/
RUN chmod u+x /script/init_gmt.sh && sync && /script/init_gmt.sh

ADD modules/${MODULE_NAME}/script/init_orfeo.sh /script/
# [HACK] OTB installation fails when calling install scripts with absolute path
RUN chmod u+x /script/init_orfeo.sh && sync && (cd /script; ./init_orfeo.sh)

ADD modules/${MODULE_NAME}/script/init_gcloud.sh /script/
RUN chmod u+x /script/init_gcloud.sh && sync && /script/init_gcloud.sh

ADD modules/${MODULE_NAME}/script/init_node.sh /script/
RUN chmod u+x /script/init_node.sh && sync && /script/init_node.sh

ADD modules/${MODULE_NAME}/script/init_gpu.sh /script/
RUN chmod u+x /script/init_gpu.sh && sync && /script/init_gpu.sh

ADD modules/${MODULE_NAME}/script/init_python_packages.sh /script/
RUN chmod u+x /script/init_python_packages.sh && sync && /script/init_python_packages.sh

ADD modules/${MODULE_NAME}/script/init_r_packages.sh /script/
RUN chmod u+x /script/init_r_packages.sh && sync && /script/init_r_packages.sh

ADD modules/${MODULE_NAME}/script/init_biota.sh /script/
RUN chmod u+x /script/init_biota.sh && sync && /script/init_biota.sh

ADD modules/${MODULE_NAME}/script/init_gwb.sh /script/
RUN chmod u+x /script/init_gwb.sh && sync && /script/init_gwb.sh

ADD modules/${MODULE_NAME}/script/init_azure_cli.sh /script/
RUN chmod u+x /script/init_azure_cli.sh && sync && /script/init_azure_cli.sh

ADD modules/${MODULE_NAME}/script/init_post.sh /script/
RUN chmod u+x /script/init_post.sh && sync && /script/init_post.sh

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

ADD modules/${MODULE_NAME}/script/init_clojure.sh /script/
RUN chmod u+x /script/init_clojure.sh && sync && /script/init_clojure.sh

ADD modules/${MODULE_NAME}/script/init_quarto.sh /script/
RUN chmod u+x /script/init_quarto.sh && sync && /script/init_quarto.sh

ADD modules/${MODULE_NAME}/script/init_sepal_ui.sh /script/
ADD modules/${MODULE_NAME}/script/requirements.txt /script/
RUN chmod u+x /script/init_sepal_ui.sh && sync && /script/init_sepal_ui.sh

ENV USER=sepal-user

ADD modules/${MODULE_NAME}/script/voila.py /usr/local/etc/jupyter/

ENV DEBIAN_FRONTEND text

CMD ["/script/init_container.sh"]
