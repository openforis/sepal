#!/usr/bin/env bash
# Runs as root on the throwaway instance: one PASS, FAIL or INFO line per check, exiting with the number of failures.
# Arguments: AWS_FSX_ID and AWS_EFS_ID. /dev/sdj is a copy of the main host's /data; the task firewall is installed
# at /usr/local/sbin/sepal-task-firewall.sh.
set -u

FSX_ID=$1
EFS_ID=$2
DATA_COPY=/dev/sdj
REQUIRED_OPTIONS='XFS_FS OVERLAY_FS NF_TABLES NFT_COMPAT NETFILTER_XTABLES BRIDGE_NETFILTER VXLAN IP_VS NFS_V4'
MODULES='xfs overlay br_netfilter vxlan ip_vs nf_tables nft_compat nfsv4'
PACKAGES='lustre-client amazon-efs-utils iptables-nft docker'
PROBE_IMAGE=alpine:3.20
FAILURES=0

main() {
    info 'Kernel' uname -r
    info 'OS' cat /etc/system-release
    info 'Optional kernel options' optional_options

    check 'Required kernel options' required_options
    check 'Kernel modules load' load_modules
    check 'cgroup v2' test "$(stat -fc %T /sys/fs/cgroup)" = cgroup2fs
    check 'Copy of /data mounts' mount_data_copy

    check 'Packages install' dnf install -y -q $PACKAGES
    check 'iptables uses nf_tables' sh -c 'iptables -V | grep nf_tables'
    check 'FSx for Lustre mounts' mount_and_list lustre "$FSX_ID" /mnt/fsx noatime,flock
    check 'EFS mounts' mount_and_list efs "$EFS_ID:/" /mnt/efs defaults

    check 'Docker starts' systemctl start docker
    check 'Docker uses overlay2 and cgroup v2' docker_storage_and_cgroups
    info 'Docker warnings' sh -c 'docker info 2>&1 | grep -i warning || echo none'
    check 'Swarm overlay network carries a container' swarm_overlay
    check 'Task firewall applies' task_firewall
    check 'Task container resolves DNS' docker run --rm --network kernel-check-task $PROBE_IMAGE nslookup aws.amazon.com
    check 'Task container cannot reach instance metadata' metadata_blocked

    check 'Kernel live patching enables' live_patching

    exit $FAILURES
}

optional_options() {
    grep -E '^(# )?CONFIG_(XFS_SUPPORT_V4|NETFILTER_XTABLES_LEGACY)[= ]' "/boot/config-$(uname -r)"
}

required_options() {
    local option missing=''
    for option in $REQUIRED_OPTIONS; do
        grep -Eq "^CONFIG_$option=(y|m)$" "/boot/config-$(uname -r)" || missing="$missing $option"
    done
    [ -z "$missing" ] || { echo "missing:$missing"; return 1; }
}

load_modules() {
    local module failed=''
    for module in $MODULES; do
        modprobe "$module" || failed="$failed $module"
    done
    [ -z "$failed" ] || { echo "failed:$failed"; return 1; }
}

# Read-only and without log replay: the snapshot was taken from a mounted filesystem
mount_data_copy() {
    for _ in $(seq 60); do
        [ -e $DATA_COPY ] && break
        sleep 1
    done
    mkdir -p /mnt/data-copy
    mount -o ro,norecovery,nouuid $DATA_COPY /mnt/data-copy || return 1
    local format
    format=$(xfs_info /mnt/data-copy | grep -Eo 'crc=[01]')
    local has_mysql=no
    [ -d /mnt/data-copy/mysql ] && has_mysql=yes
    umount /mnt/data-copy
    echo "$format, mysql directory: $has_mysql"
    [ $has_mysql = yes ]
}

mount_and_list() {
    local type=$1 source=$2 target=$3 options=$4
    mkdir -p "$target"
    mount -t "$type" -o "$options" "$source" "$target" || return 1
    ls "$target/data/sepal"
    local listed=$?
    umount "$target"
    return $listed
}

docker_storage_and_cgroups() {
    local found
    found=$(docker info --format '{{.Driver}} cgroup{{.CgroupVersion}}')
    echo "$found"
    [ "$found" = 'overlay2 cgroup2' ]
}

swarm_overlay() {
    docker swarm init --advertise-addr "$(hostname -I | awk '{print $1}')" >/dev/null &&
        docker network create --driver overlay --attachable kernel-check-overlay >/dev/null &&
        docker run --rm --network kernel-check-overlay $PROBE_IMAGE true
    local result=$?
    docker network rm kernel-check-overlay >/dev/null 2>&1
    docker swarm leave --force >/dev/null 2>&1
    return $result
}

# The same network layout as sepal-task on the main host, and the same firewall script
task_firewall() {
    docker network create --driver bridge --subnet 172.29.0.0/16 --ip-range 172.29.128.0/17 kernel-check-task >/dev/null &&
        /usr/local/sbin/sepal-task-firewall.sh &&
        iptables -S SEPAL-TASK | grep -- '--dport 53' &&
        iptables -S DOCKER-USER | grep -- '-j SEPAL-TASK'
}

metadata_blocked() {
    docker pull -q $PROBE_IMAGE >/dev/null || return 1
    ! docker run --rm --network kernel-check-task $PROBE_IMAGE wget -qT5 -O- http://169.254.169.254/
}

live_patching() {
    dnf install -y -q kpatch-dnf &&
        dnf kernel-livepatch -y auto &&
        dnf install -y -q kpatch-runtime &&
        systemctl enable --now kpatch.service &&
        systemctl is-active kpatch.service
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
