FROM caddy:2.11-alpine

EXPOSE 80 443

ENV MODULE_NAME=caddy

RUN apk add --no-cache curl

COPY modules/${MODULE_NAME}/Caddyfile /etc/caddy/Caddyfile
