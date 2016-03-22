FROM ubuntu:trusty
MAINTAINER OpenForis
ENV PATH=/opt/miniconda3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/miniconda3/envs/arcsi/bin \
    JAVA_HOME=/usr/lib/jvm/java-8-oracle \
    GDAL_DATA=/opt/miniconda3/share/gdal
ADD config/OFGTMethod /usr/local/share/OFGTMethod
ADD script/arcsi/* /usr/local/bin/
ADD script/processing/* /usr/local/bin/
ADD script/init_image.sh .
RUN chmod u+x /init_image.sh && chmod +x /usr/local/bin/* && /init_image.sh
CMD ["/bin/bash"]
