#!/bin/sh
# Keeps task containers (network sepal-task, addresses 172.29.128.0/17) away from the EC2 metadata service, from
# every private address except the gateway's HTTP port and the host's nameservers, and from the host itself.
# The gateway has a pinned address outside that range, so its own traffic is never filtered here.
# The SEPAL-TASK chain is rebuilt on every run, so changed rules replace the old ones. Docker evaluates
# DOCKER-USER before its own rules and never flushes it.
set -e

TASK_RANGE=172.29.128.0/17
GATEWAY=172.29.0.2
CHAIN=SEPAL-TASK
BLOCKED="169.254.0.0/16 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 127.0.0.0/8"
LEGACY_SUBNET=172.29.0.0/16

ensure() {
    chain=$1
    shift
    iptables -C "$chain" "$@" 2>/dev/null || iptables -I "$chain" "$@"
}

remove() {
    while iptables -C "$@" 2>/dev/null; do
        iptables -D "$@"
    done
}

nameservers() {
    resolv_file="${RESOLV_CONF:-/etc/resolv.conf}"
    [ -f "$resolv_file" ] || return 0
    grep "^nameserver" "$resolv_file" | while read -r _ ns; do
        case "$ns" in
            127.* | *:*) ;;
            *) echo "$ns" ;;
        esac
    done
}

iptables -N DOCKER-USER 2>/dev/null || true
iptables -N "$CHAIN" 2>/dev/null || true
iptables -F "$CHAIN"

iptables -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A "$CHAIN" -d "$GATEWAY" -p tcp --dport 80 -j RETURN
for ns in $(nameservers); do
    iptables -A "$CHAIN" -d "$ns" -p udp --dport 53 -j RETURN
    iptables -A "$CHAIN" -d "$ns" -p tcp --dport 53 -j RETURN
done
for destination in $BLOCKED; do
    iptables -A "$CHAIN" -d "$destination" -j DROP
done

ensure DOCKER-USER -s "$TASK_RANGE" -j "$CHAIN"
ensure INPUT -s "$TASK_RANGE" -j DROP

# Rules an earlier version of this script put directly in DOCKER-USER and INPUT, for the whole subnet.
remove DOCKER-USER -s "$LEGACY_SUBNET" -d "$LEGACY_SUBNET" -j RETURN
for ns in $(nameservers); do
    remove DOCKER-USER -s "$LEGACY_SUBNET" -d "$ns" -p udp --dport 53 -j RETURN
    remove DOCKER-USER -s "$LEGACY_SUBNET" -d "$ns" -p tcp --dport 53 -j RETURN
done
for destination in $BLOCKED; do
    remove DOCKER-USER -s "$LEGACY_SUBNET" -d "$destination" -j DROP
done
remove INPUT -s "$LEGACY_SUBNET" -j DROP
