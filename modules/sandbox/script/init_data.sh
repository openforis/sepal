#!/bin/bash
# Data access tools: rclone (pinned, checksum-verified), fuse3 for the mount sidecar, and the AWS CLI v2.
set -euo pipefail

RCLONE_VERSION=1.68.2

apt-get update
apt-get install -y fuse3
grep -qx 'user_allow_other' /etc/fuse.conf || echo 'user_allow_other' >> /etc/fuse.conf

cd /tmp
wget -nv "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.deb"
wget -nv -O rclone-SHA256SUMS "https://downloads.rclone.org/v${RCLONE_VERSION}/SHA256SUMS"
grep " rclone-v${RCLONE_VERSION}-linux-amd64.deb\$" rclone-SHA256SUMS | sha256sum -c -
dpkg -i "rclone-v${RCLONE_VERSION}-linux-amd64.deb"
rm "rclone-v${RCLONE_VERSION}-linux-amd64.deb" rclone-SHA256SUMS

curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip -q awscliv2.zip
./aws/install --update
rm -rf aws awscliv2.zip
