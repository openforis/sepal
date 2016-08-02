FROM python:2.7-onbuild
MAINTAINER OpenForis
EXPOSE 5001

ADD script /script

RUN chmod -R 500 /script

CMD [ "/script/init_container.sh" ]
