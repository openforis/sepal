FROM ubuntu:trusty
MAINTAINER OpenForis
ENV PATH=/opt/miniconda3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/miniconda3/envs/arcsi/bin \
    JAVA_HOME=/usr/lib/jvm/java-8-oracle \
    GDAL_DATA=/opt/miniconda3/share/gdal

ADD config/OFGTMethod /usr/local/share/OFGTMethod
ADD script/arcsi/* /usr/local/bin/
ADD script/processing/* /usr/local/bin/
RUN chmod +x /usr/local/bin/* && mkdir /script

ADD script/init_image.sh /script
RUN chmod u+x /script/init_image.sh && /script/init_image.sh

ADD script/init_java.sh /script
RUN chmod u+x /script/init_java.sh && /script/init_java.sh

ADD script/init_miniconda.sh /script
RUN chmod u+x /script/init_miniconda.sh && /script/init_miniconda.sh

ADD script/init_oft.sh /script
RUN chmod u+x /script/init_oft.sh && /script/init_oft.sh

ADD script/init_gdal.sh /script
RUN chmod u+x /script/init_gdal.sh && /script/init_gdal.sh

#ADD script/init_arcsi.sh /script
#RUN chmod u+x /script/init_arcsi.sh && /script/init_arcsi.sh

ADD script/init_r.sh /script
RUN chmod u+x /script/init_r.sh && /script/init_r.sh

ADD script/init_rstudio.sh /script
RUN chmod u+x /script/init_rstudio.sh && /script/init_rstudio.sh

ADD script/init_shiny_server.sh /script
RUN chmod u+x /script/init_shiny_server.sh && /script/init_shiny_server.sh

ADD script/init_shiny_server.sh /script
RUN chmod u+x /script/init_shiny_server.sh && /script/init_shiny_server.sh

ADD script/init_qgis.sh /script
RUN chmod u+x /script/init_qgis.sh && /script/init_qgis.sh

ADD script/init_post.sh /script
RUN chmod u+x /script/init_post.sh && /script/init_post.sh


CMD ["/bin/bash"]
