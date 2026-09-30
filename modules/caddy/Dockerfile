FROM caddy:2.11-alpine

EXPOSE 80 443

ENV MODULE_NAME=caddy

RUN apk add --no-cache curl

COPY modules/${MODULE_NAME}/Caddyfile /etc/caddy/Caddyfile
COPY modules/${MODULE_NAME}/maintenance /srv/maintenance
COPY modules/gui/src/app/landing/slideshow/background1.jpg modules/gui/src/app/landing/slideshow/background2.jpg modules/gui/public/resource/favicon-32x32.png /srv/maintenance/

CMD ["sh", "-c", "[ \"$SELF_SIGNED_TLS_CERTIFICATE\" = true ] && export TLS_INTERNAL_DIRECTIVE='tls internal'; exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]