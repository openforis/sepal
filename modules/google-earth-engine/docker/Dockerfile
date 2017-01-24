FROM ubuntu:xenial
MAINTAINER OpenForis
EXPOSE 5001

ADD script /script

RUN chmod -R 500 /script; sync && \
    /script/init_image.sh

ADD requirements.txt /requirements.txt
RUN pip install -r /requirements.txt

ADD src /src
CMD [ "/script/init_container.sh" ]
