FROM ubuntu:bionic
MAINTAINER OpenForis
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current \
    SDKMAN_DIR=/usr/local/lib/sdkman \
    GDAL_DATA=/usr/share/gdal \
    VERSION=2019-01-11
# VERSION used to force complete rebuild of image

ADD config /config
ADD config/OFGTMethod /usr/local/share/OFGTMethod
RUN chmod +x /usr/local/bin/*; sync && chmod -R 400 /config; sync && mkdir /script

ADD script/init_image.sh /script
RUN chmod u+x /script/init_image.sh; sync && /script/init_image.sh

ADD script/init_java.sh /script
RUN chmod u+x /script/init_java.sh; sync && /script/init_java.sh

ADD script/init_gcloud.sh /script
RUN chmod u+x /script/init_gcloud.sh; sync && /script/init_gcloud.sh

ADD script/init_oft.sh /script
RUN chmod u+x /script/init_oft.sh; sync && /script/init_oft.sh

ADD script/init_orfeo.sh /script
RUN chmod u+x /script/init_orfeo.sh; sync && /script/init_orfeo.sh

ADD script/init_esa_snap_toolbox.sh /script
RUN chmod u+x /script/init_esa_snap_toolbox.sh; sync && /script/init_esa_snap_toolbox.sh

ADD script/init_osk.sh /script
RUN chmod u+x /script/init_osk.sh; sync && /script/init_osk.sh

ADD script/init_drive.sh /script
RUN chmod u+x /script/init_drive.sh; sync && /script/init_drive.sh

ADD script/init_r.sh /script
RUN chmod u+x /script/init_r.sh; sync && /script/init_r.sh

ADD script/init_r_packages.sh /script
RUN chmod u+x /script/init_r_packages.sh; sync && /script/init_r_packages.sh

ADD script/init_node.sh /script
RUN chmod u+x /script/init_node.sh; sync && /script/init_node.sh

ADD script/init_post.sh /script
RUN chmod u+x /script/init_post.sh; sync && /script/init_post.sh

ADD script/install-dggrid.sh /usr/local/bin/install-dggrid
RUN chmod +x /usr/local/bin/install-dggrid

CMD ["/bin/bash"]
