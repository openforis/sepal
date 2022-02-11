TYPE=$1

function template {
    local template=$1
    local destination=$2
    TYPE=$TYPE envsubst < $template > $destination
}

inventory_file=$(mktemp /tmp/XXXXXX.sepal_aws_ec2.yml)
template ../template_aws_ec2.yml $inventory_file
echo $inventory_file
