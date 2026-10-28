#!/bin/bash
# EC2 user data for idle-pool workers. A volume restored from a snapshot fetches each block from S3
# on its first read, so the images baked into the AMI stay slow until something touches them. An
# idle instance reads the whole Docker volume once, while nobody is waiting on it. Parallel readers,
# because a single sequential stream fetches far below what the volume can take.

device=/dev/xvdf
readers=8

size_mib=$(( $(blockdev --getsize64 "$device") / 1048576 ))
chunk_mib=$(( (size_mib + readers - 1) / readers ))

logger -t sepal-prewarm "Reading ${size_mib} MiB of $device"
start=$(date +%s)
for i in $(seq 0 $(( readers - 1 ))); do
    dd if="$device" of=/dev/null bs=1M skip=$(( i * chunk_mib )) count="$chunk_mib" iflag=direct status=none &
done
wait
logger -t sepal-prewarm "Read $device in $(( $(date +%s) - start ))s"
