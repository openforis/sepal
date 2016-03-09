FROM ubuntu:trusty
MAINTAINER OpenForis
ENV PATH=/opt/miniconda3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/miniconda3/envs/arcsi/bin \
    JAVA_HOME=/usr/lib/jvm/java-8-oracle
ADD script/init_image.sh .
RUN chmod u+x /init_image.sh && /init_image.sh
CMD ["/bin/bash"]
