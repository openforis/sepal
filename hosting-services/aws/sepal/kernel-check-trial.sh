#!/usr/bin/env bash
# Tries AWS_AMI on a throwaway instance with a copy of the main host's /data, and removes everything it created.
# Snapshots the live /data, so it refuses production. Run with: bin/deploy -s aws/sepal/kernel-check-trial.sh -b <build> -c <config>
exec "$( dirname "${BASH_SOURCE[0]}" )/kernel-check/run.sh" trial.yml "" "$@"
