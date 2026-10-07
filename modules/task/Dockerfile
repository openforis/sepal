FROM node:26-alpine

ENV MODULE_NAME=task
ENV MODULE=/usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED=/usr/local/src/sepal/lib/js/shared

# GDAL tools and Python bindings: image exports build VRTs and name their bands, time series are stacked by a
# Python script. su-exec runs the task as the owner of the user's home.
RUN apk add --no-cache gdal-tools py3-gdal su-exec

# install lib/shared packages
WORKDIR ${SHARED}
ADD lib/js/shared .
ADD modules/${MODULE_NAME}/lib/shared/package-lock.json .
RUN npm install --omit=dev

# install module packages
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/package.json .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install --omit=dev

ADD --chmod=0755 lib/python/shared/stack_time_series.py /usr/local/bin/sepal-stack-time-series

# add module source
ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/config ${MODULE}/config
ADD --chmod=0755 modules/${MODULE_NAME}/start.sh /usr/local/bin/start.sh

CMD ["start.sh"]
