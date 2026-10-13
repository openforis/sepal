FROM node:26-alpine

ENV MODULE_NAME=task
ENV MODULE=/usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED=/usr/local/src/sepal/lib/js/shared
# V8 sizes the young generation from the container's limit and lets garbage pile up there; a 1 MB semi-space
# halves a task's memory with no measurable cost to download throughput.
ENV NODE_OPTIONS=--max-semi-space-size=1

# rclone copies exports to the user's Data. GDAL tools and Python bindings: image exports build VRTs and name their bands, time series are stacked by a
# Python script. su-exec runs the task as the owner of the user's home.
RUN apk add --no-cache gdal-tools py3-gdal rclone su-exec

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
