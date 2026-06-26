FROM caddy:2.11-alpine

EXPOSE 80 443

# curl for the docker HEALTHCHECK (caddy:alpine ships only busybox wget).
RUN apk add --no-cache curl

COPY modules/ops/Caddyfile /etc/caddy/Caddyfile
COPY modules/ops/script/start-caddy.sh /usr/local/bin/start-caddy.sh
RUN chmod 755 /usr/local/bin/start-caddy.sh

CMD ["/usr/local/bin/start-caddy.sh"]
