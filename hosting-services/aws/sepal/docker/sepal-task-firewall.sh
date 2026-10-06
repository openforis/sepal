#!/bin/sh
# Keeps task containers (network sepal-task) away from the EC2 metadata service, from every private address
# except their own network (the gateway), and from the host. Docker evaluates DOCKER-USER before its own
# rules and never flushes it; rules are inserted at the top, so they are applied in reverse.
set -e

SUBNET=172.29.0.0/16
BLOCKED="127.0.0.0/8 100.64.0.0/10 192.168.0.0/16 172.16.0.0/12 10.0.0.0/8 169.254.0.0/16"

ensure() {
    chain=$1
    shift
    iptables -C "$chain" "$@" 2>/dev/null || iptables -I "$chain" "$@"
}

iptables -N DOCKER-USER 2>/dev/null || true
for destination in $BLOCKED; do
    ensure DOCKER-USER -s "$SUBNET" -d "$destination" -j DROP
done
ensure DOCKER-USER -s "$SUBNET" -d "$SUBNET" -j RETURN
ensure INPUT -s "$SUBNET" -j DROP
