FROM ubuntu:bionic

EXPOSE 5001

ENV MODULE_NAME google-earth-engine

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

ADD modules/${MODULE_NAME}/requirements.txt /requirements.txt
RUN pip3 install -r /requirements.txt
ADD modules/${MODULE_NAME}/sepal-ee /sepal-ee
RUN pip3 install -e /sepal-ee

ADD modules/${MODULE_NAME}/src /src
CMD [ "/script/init_container.sh" ]
