FROM python:2.7-onbuild
MAINTAINER OpenForis
EXPOSE 5000

ADD script /script

RUN chmod -R 500 /script

CMD [ "/script/init_container.sh" ]
