#!/bin/sh
# Keeps task containers (network sepal-task) away from the EC2 metadata service, from every private address
# except their own network (the gateway), and from the host. Allows DNS queries through the host resolver.
# Docker evaluates DOCKER-USER before its own rules and never flushes it; rules are inserted at the top,
# so they are applied in reverse.
set -e

SUBNET=172.29.0.0/16
BLOCKED="127.0.0.0/8 100.64.0.0/10 192.168.0.0/16 172.16.0.0/12 10.0.0.0/8 169.254.0.0/16"

ensure() {
    chain=$1
    shift
    iptables -C "$chain" "$@" 2>/dev/null || iptables -I "$chain" "$@"
}

iptables -N DOCKER-USER 2>/dev/null || true

# Allow DNS queries to nameservers from resolv.conf (insert first so they're evaluated after everything else)
resolv_file="${RESOLV_CONF:-/etc/resolv.conf}"
if [ -f "$resolv_file" ]; then
    grep "^nameserver" "$resolv_file" | while read -r _ ns; do
        # Skip loopback nameservers; only allow IPv4 (no colons)
        case "$ns" in
            127.* | ::*) continue ;;
            *:*) continue ;;
        esac
        ensure DOCKER-USER -s "$SUBNET" -d "$ns" -p udp --dport 53 -j RETURN
        ensure DOCKER-USER -s "$SUBNET" -d "$ns" -p tcp --dport 53 -j RETURN
    done
fi

for destination in $BLOCKED; do
    ensure DOCKER-USER -s "$SUBNET" -d "$destination" -j DROP
done
ensure DOCKER-USER -s "$SUBNET" -d "$SUBNET" -j RETURN
ensure INPUT -s "$SUBNET" -j DROP
