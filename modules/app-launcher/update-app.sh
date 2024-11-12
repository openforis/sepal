#!/usr/bin/env bash
set -e 

export GIT_TERMINAL_PROMPT=0

app_path=$1
app_label=$2
repository=$3
branch=$4

app_name=$(basename $app_path)

function clone {
    mkdir -p "$(dirname "$app_path")"
    git clone --recurse-submodules --branch "$branch" "$repository" "$app_path"
    echo "Cloned repository into $app_path"
}

function update_app {
    if [[ ! -d "$app_path" ]]; then
        clone
        update_docker
    fi
    cd "$app_path"
    git fetch origin "$branch"
    LOCAL_COMMIT=$(git rev-parse "$branch")
    REMOTE_COMMIT=$(git rev-parse "origin/$branch")
    if [[ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]]; then
        git checkout "$branch"
        git pull origin "$branch"
        echo "Repository updated to latest commit on $branch."
        update_docker
    else
        echo "Repository is already up to date."
    fi
}

function update_docker {
    cd "$app_path"
    export GIT_COMMIT=$(git rev-parse HEAD)
    echo "Building Docker image with GIT_COMMIT=$GIT_COMMIT"
      
    docker compose --file "${app_path}/docker-compose.yml" \
        build \
        --build-arg GIT_COMMIT="$GIT_COMMIT"

    docker compose up -d
    echo "Docker containers are now running."
}


update_app
