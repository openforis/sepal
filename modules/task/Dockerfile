FROM openforis/sandbox-base

EXPOSE 1026

ENV DEBIAN_FRONTEND=noninteractive

ENV MODULE_NAME task
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV JS_SHARED /usr/local/src/sepal/lib/js/shared
ENV PYTHON_SHARED /usr/local/src/sepal/lib/python/shared
ENV NODE_MAJOR=22

# Install node.js

RUN apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 51716619E084DAB9
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update
RUN apt-get install nodejs -y

RUN groupadd --gid 1000 node && \
    useradd --uid 1000 --gid node --shell /bin/bash --create-home node

RUN npm install -g nodemon

# Set bash prompt
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /home/node/.bashrc
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /root/.bashrc

ADD lib/js/shared ${JS_SHARED}
WORKDIR ${JS_SHARED}
USER root
ADD lib/python/shared ${PYTHON_SHARED}
RUN chmod +x ${PYTHON_SHARED}/stack_time_series.py && \
    ln -s ${PYTHON_SHARED}/stack_time_series.py /usr/local/bin/sepal-stack-time-series
RUN chown -R node: ${JS_SHARED}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
ADD modules/${MODULE_NAME}/package-lock.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

USER root
ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/config ${MODULE}/config
ADD modules/${MODULE_NAME}/wait_until_initialized.sh /usr/local/bin
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin
RUN chmod +x -R /usr/local/bin && sync
CMD start.sh
