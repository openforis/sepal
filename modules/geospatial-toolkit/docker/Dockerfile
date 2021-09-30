FROM ubuntu:focal
MAINTAINER OpenForis
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current \
    SDKMAN_DIR=/usr/local/lib/sdkman \
    GDAL_DATA=/usr/share/gdal

ARG DEBIAN_FRONTEND noninteractive

ADD script/init_apt.sh /script/
RUN chmod u+x /script/init_apt.sh && sync && /script/init_apt.sh

ADD script/init_r_packages.sh /script/
RUN chmod u+x /script/init_r_packages.sh && sync && /script/init_r_packages.sh

ADD script/init_apt_packages.sh /script/
RUN chmod u+x /script/init_apt_packages.sh && sync && /script/init_apt_packages.sh

ADD script/init_java.sh /script/
RUN chmod u+x /script/init_java.sh && sync && /script/init_java.sh

ADD config /config
ADD config/OFGTMethod /usr/local/share/OFGTMethod
RUN chmod +x /usr/local/bin/* && sync && chmod -R 400 /config && sync

ADD script/init_oft.sh /script/
RUN chmod u+x /script/init_oft.sh && sync && /script/init_oft.sh

ADD script/init_esa_snap_toolbox.sh /script/
RUN chmod u+x /script/init_esa_snap_toolbox.sh && sync && /script/init_esa_snap_toolbox.sh

ADD script/init_orfeo.sh /script/
RUN chmod u+x /script/init_orfeo.sh && sync && /script/init_orfeo.sh

ADD script/init_gcloud.sh /script/
RUN chmod u+x /script/init_gcloud.sh && sync && /script/init_gcloud.sh

ADD script/init_drive.sh /script/
RUN chmod u+x /script/init_drive.sh && sync && /script/init_drive.sh

ADD script/init_node.sh /script/
RUN chmod u+x /script/init_node.sh && sync && /script/init_node.sh

ADD script/init_gpu.sh /script/
RUN chmod u+x /script/init_gpu.sh && sync && /script/init_gpu.sh

ADD script/init_python_packages.sh /script/
RUN chmod u+x /script/init_python_packages.sh && sync && /script/init_python_packages.sh

ADD script/init_additional_r_packages.sh /script/
RUN chmod u+x /script/init_additional_r_packages.sh && sync && /script/init_additional_r_packages.sh

ADD script/init_biota.sh /script/
RUN chmod u+x /script/init_biota.sh && sync && /script/init_biota.sh

ADD script/init_gwb.sh /script/
RUN chmod u+x /script/init_gwb.sh && sync && /script/init_gwb.sh

ADD script/init_azure_cli.sh /script/
RUN chmod u+x /script/init_azure_cli.sh && sync && /script/init_azure_cli.sh

ADD script/init_post.sh /script/
RUN chmod u+x /script/init_post.sh && sync && /script/init_post.sh

CMD ["/bin/bash"]
