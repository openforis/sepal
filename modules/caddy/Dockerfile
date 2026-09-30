FROM caddy:2.11-alpine

EXPOSE 80 443

ENV MODULE_NAME=caddy

RUN apk add --no-cache curl

COPY modules/${MODULE_NAME}/Caddyfile /etc/caddy/Caddyfile
COPY modules/${MODULE_NAME}/maintenance.html /usr/share/caddy/maintenance.html

CMD ["sh", "-c", "[ \"$SELF_SIGNED_TLS_CERTIFICATE\" = true ] && export TLS_INTERNAL_DIRECTIVE='tls internal'; exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]