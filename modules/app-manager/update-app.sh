#!/usr/bin/env bash
set -e 

export GIT_TERMINAL_PROMPT=0

app_path=$1
app_label=$2
repository=$3
branch=$4
current_kernels=/usr/local/share/jupyter/current-kernels
work_kernels=/usr/local/share/jupyter/kernels
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
    {
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
    } > "$kernel_path/kernel.json"
}

function update_kernel {
    update_venv
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
             micromamba create -y -p "$venv_path" -f "$app_path/sepal_environment.yml" >> "$venv_log_file"
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
        create_kernel_json >> "$venv_log_file"
        echo "Completed venv update: $current_venv_path" >> "$venv_log_file"
    else
        echo "Requirements not modified since last build: $app_path"
    fi
}

update_app
