type=$1
config_home=$2

function parse-yaml {
  prefix=$2
  s='[[:space:]]*' w='[a-zA-Z0-9_]*' fs=$(echo @|tr @ '\034')
  sed -ne "s|^\($s\):|\1|" \
      -e "s|^\($s\)\($w\)$s:$s[\"']\(.*\)[\"']$s\$|\1$fs\2$fs\3|p" \
      -e "s|^\($s\)\($w\)$s:$s\(.*\)$s\$|\1$fs\2$fs\3|p"  $1 |
  awk -F$fs '{
      indent = length($1)/2;
      vname[indent] = $2;
      for (i in vname) {if (i > indent) {delete vname[i]}}
      if (length($3) > 0) {
          vn=""; for (i=0; i<indent; i++) {vn=(vn)(vname[i])("_")}
          printf("%s%s%s=\"%s\"\n", "'$prefix'",vn, $2, $3);
      }
  }'
}

function template {
    local template=$1
    local destination=$2
    type=$type region=$region deploy_environment=$deploy_environment envsubst < $template > $destination
}

eval $(parse-yaml $config_home/secret.yml)

inventory_file=$(mktemp /tmp/XXXXXX.sepal_aws_ec2.yml)
template template_aws_ec2.yml $inventory_file
echo $inventory_file
