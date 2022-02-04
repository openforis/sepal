#!/bin/bash

# Create sepal network if it doesn't exist
docker network inspect sepal > /dev/null 2>&1 || docker network create sepal

# Start dev-env
docker compose build && docker compose run sepal-dev
