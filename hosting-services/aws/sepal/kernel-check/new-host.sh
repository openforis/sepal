#!/usr/bin/env bash
# Runs as root on a deployed host: one PASS, FAIL or INFO line per check, exiting with the number of failures.
# Argument: the host's Type tag (Sepal, SepalStorage or SepalApps).
set -u

TYPE=$1
PROBE_IMAGE=alpine:3.20
FAILURES=0

main() {
    info 'Kernel' uname -r
    info 'OS' cat /etc/system-release
    check 'Docker and monit run' systemctl is-active docker monit
    check 'Docker uses overlay2 and cgroup v2' docker_storage_and_cgroups
    check 'iptables uses nf_tables' sh -c 'iptables -V | grep nf_tables'

    case "$TYPE" in
        Sepal) main_host ;;
        SepalStorage) storage_host ;;
        SepalApps) ;;
        *) echo "FAIL  Unknown host type $TYPE"; FAILURES=$((FAILURES + 1)) ;;
    esac

    info 'Kernel errors and warnings' sh -c 'dmesg --level=err,warn | tail -5'
    exit $FAILURES
}

main_host() {
    check 'Volumes mounted' sh -c 'for target in /data /var/lib/docker /var/log; do findmnt -n "$target" || exit 1; done'
    check 'EFS mounted' findmnt -t nfs4 /data/sepal/home
    check 'Lustre mounted' sh -c 'findmnt -t lustre | grep /data/sepal/jupyter'
    check 'Task firewall and live patching active' systemctl is-active sepal-task-firewall kpatch
    check 'Task chain allows DNS' sh -c "iptables -S SEPAL-TASK | grep -- '--dport 53'"
    check 'Task traffic jumps to the task chain' sh -c "iptables -S DOCKER-USER | grep -- '-j SEPAL-TASK'"
    check 'Bridged traffic is filtered' sh -c 'sysctl -n net.bridge.bridge-nf-call-iptables | grep -x 1'
    check 'Task container resolves DNS' docker run --rm --network sepal-task $PROBE_IMAGE nslookup aws.amazon.com
    check 'Task container cannot reach instance metadata' metadata_blocked
}

storage_host() {
    check 'EFS mounted' findmnt -t nfs4 /data/sepal/home
    check 'Swarm overlay reaches MySQL' docker run --rm --network sepal busybox:1.36 nc -zv -w5 mysql 3306
}

docker_storage_and_cgroups() {
    local found
    found=$(docker info --format '{{.Driver}} cgroup{{.CgroupVersion}}')
    echo "$found"
    [ "$found" = 'overlay2 cgroup2' ]
}

metadata_blocked() {
    docker pull -q $PROBE_IMAGE >/dev/null || return 1
    ! docker run --rm --network sepal-task $PROBE_IMAGE wget -qT5 -O- http://169.254.169.254/
}

check() {
    local name=$1
    shift
    local output
    if output=$("$@" 2>&1); then
        echo "PASS  $name${output:+ ($(echo "$output" | tail -1))}"
    else
        echo "FAIL  $name"
        echo "$output" | tail -5 | sed 's/^/        /'
        FAILURES=$((FAILURES + 1))
    fi
}

info() {
    local name=$1
    shift
    echo "INFO  $name: $("$@" 2>&1 | tr '\n' ' ')"
}

main
