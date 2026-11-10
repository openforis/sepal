#!/usr/bin/env bash
# Tries AWS_AMI on a throwaway instance with a volume made from the latest /data snapshot, and removes the instance and
# the volume. Refuses production. Run with: bin/deploy -s aws/sepal/kernel-check-trial.sh -b <build> -c <config>
exec "$( dirname "${BASH_SOURCE[0]}" )/kernel-check/run.sh" trial.yml "" "$@"
