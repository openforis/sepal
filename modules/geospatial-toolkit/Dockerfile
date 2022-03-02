FROM openforis/sandbox-base

ENV MODULE_NAME geospatial-toolkit
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

ADD modules/${MODULE_NAME}/script/init_orfeo.sh /script/
RUN chmod u+x /script/init_orfeo.sh && sync && /script/init_orfeo.sh

ADD modules/${MODULE_NAME}/script/init_gcloud.sh /script/
RUN chmod u+x /script/init_gcloud.sh && sync && /script/init_gcloud.sh

ADD modules/${MODULE_NAME}/script/init_drive.sh /script/
RUN chmod u+x /script/init_drive.sh && sync && /script/init_drive.sh

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

ENV DEBIAN_FRONTEND text

CMD ["/bin/bash"]
