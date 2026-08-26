#!/bin/bash
#
# Starts one of the sandbox's on-demand servers and returns only once it is listening.
# The worker execs this over the Docker API; the EXIT CODE is the whole contract.
#
# The supervisord config lives outside supervisorctl's default search path and is root-only
# (0400), so -c is mandatory.

set -u

CONFIG=/etc/supervisor/conf.d/supervisord.conf
TIMEOUT=60

action=${1:-}
endpoint=${2:-}

case "$endpoint" in
    rstudio) program=rserver;     port=8787 ;;
    shiny)   program=shinyserver; port=3838 ;;
    jupyter) program=jupyter;     port=8888 ;;
    *) echo >&2 "Unknown endpoint: $endpoint"; exit 2 ;;
esac

if [ "$action" != "start" ]; then
    echo >&2 "Unknown action: $action"
    exit 2
fi

# Already-running is success, not an error: the worker calls this whenever it has forgotten
# whether the server is up, and a restart must not cost the user a failed app launch.
supervisorctl -c "$CONFIG" start "$program" 2>&1 | grep -v 'already started'

for i in $(seq "$TIMEOUT" -1 0); do
    if netstat -ntl | grep -q ":$port "; then
        echo "$endpoint listening on $port"
        exit 0
    fi
    sleep 1
done

echo >&2 "$endpoint did not start listening on $port within ${TIMEOUT}s"
supervisorctl -c "$CONFIG" status "$program" >&2
exit 1
