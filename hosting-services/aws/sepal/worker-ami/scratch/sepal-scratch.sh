#!/bin/bash
# Formats the instance type's local NVMe SSDs at every boot, striped into one device when there are
# several, and mounts them over Docker's volume directory, where the worker keeps each session's
# /tmp as a volume. Instance store is blank after a stop anyway. A type without local SSDs gets a
# blank EBS volume per session instead, which the worker attaches and formats itself.
set -euo pipefail

mount_point=/var/lib/docker/volumes
raid_device=/dev/md0

main() {
    local device
    device=$(scratch_device)
    if [[ -z $device ]]; then
        logger -t sepal-scratch "No local SSD; the worker attaches a volume per session"
        exit 0
    fi
    # -K skips the discard pass: the device is blank or holds only scratch data.
    mkfs.xfs -q -f -K "$device"
    mkdir -p "$mount_point"
    mount -o noatime "$device" "$mount_point"
    chmod 701 "$mount_point"
    logger -t sepal-scratch "Mounted $device ($(lsblk --noheadings --output SIZE "$device" | head -1 | tr -d ' ')) on $mount_point"
}

scratch_device() {
    local ssds
    mapfile -t ssds < <(instance_store_devices)
    if (( ${#ssds[@]} == 1 )); then
        echo "${ssds[0]}"
    elif (( ${#ssds[@]} > 1 )); then
        # A reboot re-assembles the previous boot's array, which would hold the devices.
        mdadm --stop --scan >&2 || true
        mdadm --create "$raid_device" --run --level=0 --raid-devices=${#ssds[@]} "${ssds[@]}" >&2
        udevadm settle
        echo "$raid_device"
    fi
}

instance_store_devices() {
    lsblk --nodeps --noheadings --paths --output NAME,MODEL | awk '/Amazon EC2 NVMe Instance Storage/ {print $1}'
}

main
