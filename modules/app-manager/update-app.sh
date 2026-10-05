#!/usr/bin/env bash
set -e 

export GIT_TERMINAL_PROMPT=0

app_path=$1
app_label=$2
repository=$3
branch=$4
cache_venv=${5:-false}
current_kernels=/usr/local/share/jupyter/current-kernels
work_kernels=/usr/local/share/jupyter/kernels
# What the sandbox calls current_kernels: worker mounts it at this path (workerTypes.js).
current_kernels_in_sandbox=/usr/local/share/jupyter/kernels
app_name=$(basename $app_path)
kernel_path="$current_kernels/venv-$app_name"
venv_path="$work_kernels/venv-$app_name/venv"
current_venv_path="$current_kernels/venv-$app_name/venv"
venv_log_file="/usr/local/share/jupyter/log/venv-$app_name.log"

function update_app {
    if [[ ! -d "$app_path" ]]
    then
        clone
    fi
    cd $app_path
    git checkout $branch
    git pull
    if [[ -f "$app_path/requirements.txt" ]] || [[ -f "$app_path/sepal_environment.yml" ]]
    then
        update_kernel
    fi
    echo "Updated $app_path"
}

function clone {
    mkdir -p $(dirname $app_path)
    cd $(dirname $app_path)
    git clone --recurse-submodules $repository
    cd $app_path
    git fetch
}

function json_escape {
    local value=$1
    value=${value//\\/\\\\}
    value=${value//\"/\\\"}
    value=${value//$'\n'/\\n}
    value=${value//$'\r'/\\r}
    value=${value//$'\t'/\\t}
    printf '%s' "$value"
}

function create_kernel_json {
    echo "Creating kernel: $kernel_path"
    mkdir -p "$kernel_path"
    local python_bin=$(json_escape "$venv_path/bin/python3")
    local display_name=$(json_escape " (venv) $app_label")
    local proj_data=$(json_escape "$venv_path/share/proj")
    local gdal_data=$(json_escape "$venv_path/share/gdal")
    local launcher=$(json_escape "$current_kernels_in_sandbox/sepal-app-kernel")
    local app=$(json_escape "$app_name")
    {
        # Gated on the launcher actually being installed: naming a launcher that is not there
        # is the spec's "kernel fails to start, every flagged app" row.
        if [[ "$cache_venv" == true && -x "$current_kernels/sepal-app-kernel" ]]; then
            # The launcher picks the prefix at run time, so no PROJ/GDAL path may be baked in
            # here: a generated one would pin the kernel to Lustre even when a copy is in use.
            cat <<EOF
{
  "argv": [
    "/bin/bash",
    "$launcher",
    "$app",
    "-f",
    "{connection_file}"
  ],
  "display_name": "$display_name",
  "language": "python",
  "env": {
    "PYTHONNOUSERSITE": "1"
  }
}
EOF
        else
        cat <<EOF
{
  "argv": [
    "$python_bin",
    "-m",
    "ipykernel_launcher",
    "-f",
    "{connection_file}"
  ],
  "display_name": "$display_name",
  "language": "python",
EOF
        if [[ -f "$app_path/sepal_environment.yml" ]]; then
            cat <<EOF
  "env": {
    "PYTHONNOUSERSITE": "1",
    "PROJ_LIB": "$proj_data",
    "PROJ_DATA": "$proj_data",
    "GDAL_DATA": "$gdal_data"
  }
EOF
        else
            cat <<EOF
  "env": {
    "PYTHONNOUSERSITE": "1"
  }
EOF
        fi
        cat <<EOF
}
EOF
        fi
    } > "$kernel_path/kernel.json.tmp"
    if cmp -s "$kernel_path/kernel.json.tmp" "$kernel_path/kernel.json"; then
        rm -f "$kernel_path/kernel.json.tmp"
    else
        mv -f "$kernel_path/kernel.json.tmp" "$kernel_path/kernel.json"
    fi
    return 0
}

function sync_launcher {
    # Resolved per call, not at load time, so the tests can point at a fixture.
    local src=${LAUNCHER_SRC:-/etc/sepal/app-manager/sepal-app-kernel}
    local dst="$current_kernels/sepal-app-kernel"
    cmp -s "$src" "$dst" && return 0
    # install writes in place and bash reads scripts incrementally, so replacing the live
    # launcher directly can hand a concurrent kernel start a half-written file.
    if install -m 0755 "$src" "$dst.tmp.$$" && mv -f "$dst.tmp.$$" "$dst"; then
        echo "Installed kernel launcher: $dst"
    else
        # Silence here would be dangerous: create_kernel_json would still name the launcher.
        echo "Failed to install kernel launcher from $src"
        rm -f "$dst.tmp.$$"
    fi
    return 0
}

function pack_venv {
    local out="$kernel_path/venv.tar.zst"
    if [[ "$cache_venv" != true ]]; then rm -f "$out" "$out.failed"; return 0; fi
    if [[ -f "$out" && "$out" -nt "$current_venv_path/.installed" ]]; then return 0; fi
    # A failed pack deletes the archive, so without a marker the next pass re-reads and
    # re-compresses the whole tree. monitorApps walks apps serially, so that would stall every
    # other app for as long as the cause persists. Back off until the venv itself changes.
    if [[ -f "$out.failed" && "$out.failed" -nt "$current_venv_path/.installed" ]]; then return 0; fi
    echo "Packing venv: $out"
    # pipefail in a subshell: without it a failing tar still lets zstd exit 0, publishing an
    # archive that extracts cleanly but holds a partial environment.
    if ( set -o pipefail
         tar -C "$kernel_path" -cf - venv | zstd -q -3 -T0 -o "$out.tmp" ); then
        mv -f "$out.tmp" "$out" && rm -f "$out.failed"
    else
        # Never leave the previous archive published against a rebuilt venv: it would silently
        # run old dependencies, which is worse than falling back to Lustre.
        echo "Packing failed; dropping any stale archive and backing off until the venv changes"
        rm -f "$out.tmp" "$out"
        touch "$out.failed"
    fi
    return 0
}

# Idempotent, and cheap when there is nothing to do: app-manager calls update-app for every app
# on a 5 s loop, while update_venv only rebuilds when requirements change. Reconciling here is
# what lets an app that never rebuilds still get its archive.
function reconcile_artifacts {
    sync_launcher
    pack_venv
    create_kernel_json
    return 0
}

function update_kernel {
    update_venv
    reconcile_artifacts >> "$venv_log_file" 2>&1
}

function update_venv {
    local req_file=""
    if [[ -f "$app_path/sepal_environment.yml" ]]; then
        req_file="$app_path/sepal_environment.yml"
    elif [[ -f "$app_path/requirements.txt" ]]; then
        req_file="$app_path/requirements.txt"
    fi

    # $current_venv_path/.installed vs $app_path/needVenvUpdate
    if [[ ! -f "$current_venv_path/.installed" ]] || [[ "$current_venv_path/.installed" -ot "$req_file" ]]
    then
        rm -f $venv_log_file
        echo "Removing eventual existing venv: $venv_path" >> "$venv_log_file"
        rm -rf "$venv_path"
        echo "Creating venv: $venv_path" >> "$venv_log_file"
        
        if [[ -f "$app_path/sepal_environment.yml" ]]; then
             # Root's repodata cache never expires, so a just-published package reads as a typo.
             micromamba create -y --retry-clean-cache -p "$venv_path" -f "$app_path/sepal_environment.yml" >> "$venv_log_file"
             "$venv_path"/bin/pip install ipykernel >> "$venv_log_file"
        else
            python3 -m venv $venv_path
            "$venv_path"/bin/python3 -m pip install --no-cache-dir ipykernel wheel >> "$venv_log_file"
            "$venv_path"/bin/python3 -m pip install --no-cache-dir numpy >> "$venv_log_file"
            "$venv_path"/bin/python3 -m pip install --no-cache-dir gdal==3.11.4 >> "$venv_log_file"
            "$venv_path"/bin/python3 -m pip install --no-cache-dir "git+https://github.com/openforis/earthengine-api.git@v1.6.14#egg=earthengine-api&subdirectory=python" >> "$venv_log_file"
            "$venv_path"/bin/python3 -m pip install --no-cache-dir -r "$app_path"/requirements.txt >> "$venv_log_file"
        fi

        if [[ -d $current_venv_path ]] 
        then
            echo "Moving away current venv: $current_venv_path" >> "$venv_log_file"
            mv -f "$current_venv_path" "$work_kernels"/venv-to-remove >> "$venv_log_file"
        fi
        mkdir -p "$kernel_path" >> "$venv_log_file"
        echo "Moving new venv into place: "$venv_path" -> $current_venv_path" >> "$venv_log_file"
        mv -f "$venv_path" "$current_venv_path" >> "$venv_log_file"
        echo "Setting venv file permissions: $current_venv_path" >> "$venv_log_file"
        chmod +rw "$current_venv_path" >> "$venv_log_file"
        echo "Removing old venv" >> "$venv_log_file"
        rm -rf "$work_kernels"/venv-to-remove >> "$venv_log_file"
        touch $current_venv_path/.installed >> "$venv_log_file"
        echo "Completed venv update: $current_venv_path" >> "$venv_log_file"
    else
        echo "Requirements not modified since last build: $app_path"
    fi
}

# Guarded so the reconciliation functions can be sourced by the tests.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    update_app
fi
