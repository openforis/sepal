#!/bin/bash
# Data access tools: rclone, fuse3 for the mount sidecar, and the AWS CLI v2; both downloads pinned and checksum-verified.
set -euo pipefail

RCLONE_VERSION=1.68.2
# From the release's SHA256SUMS.
RCLONE_SHA256=ee138bbc507deb8d2a854aec1a5128e5de0a4069102f2a4a17e62d80e45b0eb2
AWS_CLI_VERSION=2.37.5
# Computed from the downloaded zip when the version was pinned.
AWS_CLI_SHA256=850ba65f1342a1f725f4868de3c4621ea729af31dac96e54b574cbb0ef309029

apt-get update
apt-get install -y fuse3
grep -qx 'user_allow_other' /etc/fuse.conf || echo 'user_allow_other' >> /etc/fuse.conf

cd /tmp
wget -nv "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.deb"
echo "${RCLONE_SHA256}  rclone-v${RCLONE_VERSION}-linux-amd64.deb" | sha256sum -c -
dpkg -i "rclone-v${RCLONE_VERSION}-linux-amd64.deb"
rm "rclone-v${RCLONE_VERSION}-linux-amd64.deb"

curl -sSfL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-${AWS_CLI_VERSION}.zip" -o awscliv2.zip
echo "${AWS_CLI_SHA256}  awscliv2.zip" | sha256sum -c -
unzip -q awscliv2.zip
./aws/install --update
rm -rf aws awscliv2.zip
