FROM registry:2

RUN apk update && apk add apache2-utils

ADD /script/start-registry.sh /usr/local/sbin/start-registry
RUN chmod +x /usr/local/sbin/start-registry

# CMD /usr/local/sbin/start-registry
