#!/bin/bash
set -e 

SEPAL_CONFIG=/etc/sepal/module.d
SEPAL=/usr/local/lib/sepal
SEPAL_MODULES="user sepal-server api-gateway task-executor gee gui ceo mongo"

pidof () {
    screen -ls | grep "sepal:$1" | cut -d "." -f 1
}

status () {
    for MODULE in "$@"
    do
        PID=$(pidof ${MODULE})
        if [ -z "$PID" ]; then
            echo "[STOPPED] ${MODULE}"
        else
            echo "[RUNNING] ${MODULE}"
        fi
    done
}

stop () {
    for MODULE in "$@"; do
        PID=$(pidof ${MODULE})
        [ ! -z "$PID" ] && pkill -P $PID
    done
    status ${SEPAL_MODULES}
}

start () {
    for MODULE in "$@"; do
        PID=$(pidof ${MODULE})
        [ -z "$PID" ] && screen -d -S sepal:${MODULE} -m $0 run-${MODULE}
    done
    status ${SEPAL_MODULES}
}

restart () {
    stop $@
    start $@
}

clean () {
    $SEPAL/gradlew clean -p $SEPAL
}

build () {
    $SEPAL/gradlew build -x test -x :sepal-gui:build -p $SEPAL
}

build-debug () {
    $SEPAL/gradlew build -x test -x :sepal-gui:build -p $SEPAL --stacktrace --debug
}

rebuild () {
    stop $SEPAL_MODULES
    build
    start $SEPAL_MODULES
}

inspect () {
    PID=$(pidof $1)
    if [ -z "$PID" ]; then
        echo "Not running $1"
    else
        screen -r sepal:$1
    fi
}

usage () {
    if [ ! -z "$1" ]; then
        echo "Error: $1"
    fi
    echo "Usage: $0 <command> [<arguments>]"
    echo ""
    echo "Commands:"
    echo "  clean                    clean SEPAL"
    echo "  build                    build SEPAL"
    echo "  build-debug              build SEPAL w/debug enabled"
    echo "  rebuild                  build SEPAL and restart"
    echo "  status [<module>...]     check services"
    echo "  stop [<module>...]       stop services"
    echo "  start [<module>...]      start services"
    echo "  restart [<module>...]    restart services"
    echo "  inspect <module>         recall service console"

    echo ""
    echo "Modules: $SEPAL_MODULES"
    echo ""
    exit 1
}

missing_parameter () {
    usage "Missing parameter"
}

case $1 in
clean)
    clean
    ;;
build)
    build
    ;;
build-debug)
    build-debug
    ;;
rebuild)
    rebuild
    ;;
status)
    shift
    if [ -z "$1" ]; then
        status $SEPAL_MODULES
    else
        status $@
    fi
    ;;
start)
    shift
    if [ -z "$1" ]; then
        start $SEPAL_MODULES
    else
        start $@
    fi
    ;;
restart)
    shift
    if [ -z "$1" ]; then
        restart $SEPAL_MODULES
    else
        restart $@
    fi
    ;;
stop)
    shift   
    if [ -z "$1" ]; then
        stop $SEPAL_MODULES
    else
        stop $@
    fi
    ;;
inspect)
    shift
    if [ -z "$1" ]; then
        missing_parameter
    else
        inspect $1
    fi
    ;;
run-api-gateway)
    $SEPAL/gradlew \
      -p $SEPAL \
      --no-daemon \
      :sepal-api-gateway:runDev \
      -DconfigDir="$SEPAL_CONFIG/api-gateway"
    ;;
run-mongo)
    mkdir -p /var/sepal/ceo/db
    mongod --dbpath /var/sepal/ceo/db
    ;;
run-ceo)
    eval $(parse-yaml /etc/sepal/conf.d/secret.yml)
    export sepal_host=`dig +short myip.opendns.com @resolver1.opendns.com`
    export private_key_path=${HOME}/.ssh/google-earth-engine.key
    mkdir -p ${HOME}/.ssh/
    echo -e $google_earth_engine_private_key > $private_key_path
    pip3 install -r $SEPAL/modules/ceo/docker/requirements.txt
    mkdir -p /var/sepal/ceo/cep
    cd $SEPAL/modules/ceo/docker/src/ceo/static
    yarn install
    gunicorn \
        --pythonpath $SEPAL/modules/ceo/docker/src/ceo \
        --bind 0.0.0.0:7766 \
        --workers 5 \
        --timeout 3600 \
        --threads 16 \
        --backlog 64 \
        --error-logfile - \
        --log-file - \
        --access-logfile - \
        --log-level debug \
        --capture-output "wsgi:build_app( \
            gmaps_api_key='$google_maps_api_key', \
            digital_globe_api_key='$digital_globe_api_key', \
            dgcs_connect_id='$digital_globe_connect_id', \
            planet_api_key='$planet_api_key', \
            sepal_host='${sepal_host:-localhost}', \
            ee_account='$google_earth_engine_account', \
            ee_key_path='$private_key_path')" \
    ;;
run-gee)
    # source etc/sepal/google-earth-engine/venv/bin/activate
    pip3 install -r $SEPAL/modules/google-earth-engine/docker/requirements.txt
    pip3 install -e $SEPAL/modules/google-earth-engine/docker/sepal-ee
    python3\
        $SEPAL/modules/google-earth-engine/docker/src/test_server.py \
        --gee-email google-earth-engine@openforis-sepal.iam.gserviceaccount.com \
        --gee-key-path $SEPAL_CONFIG/google-earth-engine/gee-service-account.pem \
        --sepal-host localhost:3000 \
        --sepal-username "sepalAdmin" \
        --sepal-password "the admin password" \
        --home-dir $SEPAL_CONFIG/sepal-server/home/admin \
        --username admin
    ;;
run-gui)
    cd $SEPAL/modules/gui/frontend
    npm install
    npm start
    ;;
run-sepal-server)
    $SEPAL/gradlew \
      -p $SEPAL \
      --no-daemon \
      :sepal-server:runDev \
      -DconfigDir="$SEPAL_CONFIG/sepal-server" 
          #-DskipSceneMetaDataUpdate
    ;;
run-task-executor)
    $SEPAL/gradlew \
      -p $SEPAL \
      --no-daemon \
      :task-executor:runDev --args="$SEPAL_CONFIG/task-executor/task-executor.properties"
  ;;
run-user)
    $SEPAL/gradlew \
      -p $SEPAL \
      --no-daemon \
      :sepal-user:runDev \
      -DconfigDir="$SEPAL_CONFIG/user"
    ;;
*)
    usage
    ;;
esac
