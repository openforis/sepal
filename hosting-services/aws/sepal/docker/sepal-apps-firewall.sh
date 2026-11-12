#!/bin/sh
# Keeps app containers (network sepal-apps, addresses 172.30.128.0/17) and their image builds (the default bridge,
# where Dockerfile RUN steps run) away from the EC2 metadata service, from every private address except the host's
# nameservers, and from the host itself. Nothing else on the apps host uses the default bridge. That covers the VPC, where the
# host's swarm ports would let them inject traffic into the sepal overlay, as well as app-launcher and other apps.
# app-launcher has a pinned address outside that range, so its connections to the apps are never filtered here and
# the apps can only reply to it. The SEPAL-APPS chain is replaced atomically on every run, so changed rules take
# effect without a gap in filtering for running apps. Docker evaluates DOCKER-USER before its own rules and never
# flushes it. Bridge filtering is enabled last: if it fails the unit fails, but the rules above are already in place.
set -e

APPS_RANGE=172.30.128.0/17
BUILD_BRIDGE=docker0
CHAIN=SEPAL-APPS
BLOCKED="169.254.0.0/16 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 127.0.0.0/8"

ensure() {
    chain=$1
    shift
    iptables -C "$chain" "$@" 2>/dev/null || iptables -I "$chain" "$@"
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

rules() {
    echo '*filter'
    echo ":$CHAIN - [0:0]"
    echo "-A $CHAIN -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN"
    for ns in $(nameservers); do
        echo "-A $CHAIN -d $ns -p udp --dport 53 -j RETURN"
        echo "-A $CHAIN -d $ns -p tcp --dport 53 -j RETURN"
    done
    for destination in $BLOCKED; do
        echo "-A $CHAIN -d $destination -j DROP"
    done
    echo 'COMMIT'
}

iptables -N DOCKER-USER 2>/dev/null || true
rules | iptables-restore --noflush

ensure DOCKER-USER -s "$APPS_RANGE" -j "$CHAIN"
ensure DOCKER-USER -i "$BUILD_BRIDGE" -j "$CHAIN"
ensure INPUT -s "$APPS_RANGE" -j DROP
ensure INPUT -i "$BUILD_BRIDGE" -j DROP

# Placed last so a failure here cannot skip the rules above. Without br_netfilter, traffic between
# containers on the sepal-apps bridge never reaches iptables.
modprobe br_netfilter
sysctl -q -w net.bridge.bridge-nf-call-iptables=1
