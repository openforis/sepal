TYPE=$1

function template {
    local template=$1
    local destination=$2
    TYPE=$TYPE envsubst < $template > $destination
}

inventory_file=$(mktemp /tmp/XXXXXX.gcp.yml)
template ../template.gcp.yml $inventory_file
echo $inventory_file
