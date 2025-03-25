#!/usr/bin/env bash

set -e

app_path=$1
app_label=$2
repository=$3
branch=$4

app_name=$(basename "$app_path")
max_retries=3  # Maximum number of retries for cloning and building

function log {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

function clone_repository {
    local attempt=1
    while [ $attempt -le $max_retries ]; do
        log "Cloning repository (Attempt $attempt)..."
        if git clone --recurse-submodules --branch "$branch" "$repository" "$app_path"; then
            log "Repository cloned successfully into $app_path."
            return 0
        else
            log "Failed to clone repository. Retrying in 5 seconds..."
            sleep 5
            attempt=$((attempt + 1))
        fi
    done
    log "Failed to clone repository after $max_retries attempts."
    exit 1
}

function check_branch_exists {
    if git ls-remote --exit-code --heads "$repository" "$branch"; then
        log "Branch '$branch' exists on remote."
        return 0
    else
        log "Branch '$branch' does not exist on remote."
        exit 1
    fi
}

function update_repository {
    cd "$app_path"
    git fetch origin "$branch"
    LOCAL_COMMIT=$(git rev-parse "$branch")
    REMOTE_COMMIT=$(git rev-parse "origin/$branch")
    if [[ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]]; then
        log "New commits detected on branch '$branch'."
        git checkout "$branch"
        git pull origin "$branch"
        log "Repository updated to the latest commit."
        build_and_restart_docker
    else
        log "No new commits on branch '$branch'."
        if ! are_containers_running; then
            log "Containers are not running. Starting containers without rebuilding."
            start_docker_containers
        else
            log "Containers are running."
        fi
    fi
}

function build_and_restart_docker {
    cd "$app_path"
    export GIT_COMMIT=$(git rev-parse HEAD)
    local attempt=1
    while [ $attempt -le $max_retries ]; do
        log "Building Docker image (Attempt $attempt)..."
        if docker compose --file "${app_path}/docker-compose.yml" build --build-arg GIT_COMMIT="$GIT_COMMIT"; then
            log "Docker image built successfully."
            start_docker_containers
            return 0
        else
            log "Docker build failed. Retrying in 5 seconds..."
            sleep 5
            attempt=$((attempt + 1))
        fi
    done
    log "Docker build failed after $max_retries attempts."
    exit 1
}

function start_docker_containers {
    log "Starting Docker containers..."
    if docker compose up -d; then
        log "Docker containers started successfully."
        if ! are_containers_running; then
            log "Containers are not running as expected after startup."
            exit 1
        fi
    else
        log "Failed to start Docker containers."
        exit 1
    fi
}

function are_containers_running {
    cd "$app_path"
    local containers_status
    containers_status=$(docker compose ps --filter "status=running" --services)
    if [ -z "$containers_status" ]; then
        return 1  # Containers are not running
    else
        return 0  # Containers are running
    fi
}

function main {
    if [[ ! -d "$app_path" ]]; then
        log "App path '$app_path' does not exist."
        clone_repository
        build_and_restart_docker
    else
        cd "$app_path"
        check_branch_exists
        update_repository
    fi
}

main