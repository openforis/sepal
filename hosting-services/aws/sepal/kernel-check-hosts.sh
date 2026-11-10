#!/usr/bin/env bash
# Checks the deployed main, storage and apps hosts. Read-only apart from short-lived probe containers.
# Run with: bin/deploy -s aws/sepal/kernel-check-hosts.sh -b <build> -c <config>
exec "$( dirname "${BASH_SOURCE[0]}" )/kernel-check/run.sh" hosts.yml "Sepal SepalStorage SepalApps" "$@"
