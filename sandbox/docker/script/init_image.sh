#!/bin/bash

apt-get update && apt-get install -y nfs-common quota
chmod u+x ./init_sandbox.run
chmod u+x /root/healt_check.sh