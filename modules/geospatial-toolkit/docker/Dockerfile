FROM ubuntu:xenial
MAINTAINER OpenForis
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    JAVA_HOME=/usr/lib/jvm/java-8-oracle \
    GDAL_DATA=/usr/share/gdal

ADD config/OFGTMethod /usr/local/share/OFGTMethod
ADD script/processing/* /usr/local/bin/
RUN chmod +x /usr/local/bin/* && mkdir /script

ADD script/init_image.sh /script
RUN chmod u+x /script/init_image.sh && /script/init_image.sh

ADD script/init_java.sh /script
RUN chmod u+x /script/init_java.sh && /script/init_java.sh

ADD script/init_oft.sh /script
RUN chmod u+x /script/init_oft.sh && /script/init_oft.sh

ADD script/init_esa_snap_toolbox.sh /script
RUN chmod u+x /script/init_esa_snap_toolbox.sh && /script/init_esa_snap_toolbox.sh

ADD script/init_osk.sh /script
RUN chmod u+x /script/init_osk.sh && /script/init_osk.sh

ADD script/init_r.sh /script
RUN chmod u+x /script/init_r.sh && /script/init_r.sh

ADD script/init_r_packages.sh /script
RUN chmod u+x /script/init_r_packages.sh && /script/init_r_packages.sh

ADD script/init_post.sh /script
RUN chmod u+x /script/init_post.sh && /script/init_post.sh

CMD ["/bin/bash"]
