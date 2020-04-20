#!/bin/bash
set -e 

SEPAL_CONFIG=/etc/sepal/module.d
SEPAL=/usr/local/lib/sepal
SEPAL_MODULES=(user sepal-server api-gateway task-executor gee gui ceo mongo)
LOG_DIR=/var/log/sepal

is_module () {
    local MODULE=$1
    printf '%s\n' ${SEPAL_MODULES[@]} | grep -qP "^$MODULE$"
}

pidof () {
    local MODULE=$1
    ps -ef | grep bash | grep "sepal run $MODULE" | awk '{ print $2 }'
}

is_running () {
    local MODULE=$1
    local PID=$(pidof ${MODULE})
    [ ! -z "$PID" ]
}

logfile () {
    local MODULE=$1
    echo "$LOG_DIR/$MODULE.log"
}

message () {
    local MESSAGE=$1
    local MODULE=$2
    local COLOR_NAME=$3
    local NO_COLOR='\033[0m'
    case "$COLOR_NAME" in
    DARK_RED)
        COLOR='\033[0;31m'
        ;;
    LIGHT_RED)
        COLOR='\033[1;31m'
        ;;
    DARK_GREEN)
        COLOR='\033[0;32m'
        ;;
    LIGHT_GREEN)
        COLOR='\033[1;32m'
        ;;
    GREY)
        COLOR='\033[0;37m'
        ;;
    *)
        COLOR=$NO_COLOR # No Color
        ;;
    esac
    echo -e "[${COLOR}${MESSAGE}${NO_COLOR}] ${MODULE}"
}

module_status () {
    local MODULE=$1    
    if is_running $MODULE; then
        message "RUNNING" $MODULE DARK_GREEN
    else
        message "NOT RUNNING" $MODULE DARK_RED
    fi
}

module_start () {
    local MODULE=$1    
    local PID=$(pidof ${MODULE})
    if [[ -z "$PID" ]]; then
        local LOG=$(logfile $MODULE)
        message "STARTING" $MODULE LIGHT_GREEN
        start-stop-daemon --start --oknodo --name $MODULE \
            --exec /bin/bash -- $0 run $MODULE >$LOG 2>&1 &
    else
        message "RUNNING" $MODULE GREY
    fi
}

module_stop () {
    local MODULE=$1    
    local PID=$(pidof ${MODULE})
    if [[ -z "$PID" ]]; then
        message "NOT RUNNING" $MODULE GREY
    else
        message "STOPPING" $MODULE LIGHT_RED
        start-stop-daemon --stop --oknodo --retry 5 --ppid $PID
    fi
}

do_with_modules () {
    local COMMAND=$1
    shift
    local MODULES=${@:-${SEPAL_MODULES[@]}}
    for MODULE in $MODULES; do
        if is_module $MODULE; then
            $COMMAND $MODULE
        else
            message "IGNORED" $MODULE GREY
        fi
    done
}

status () {
    do_with_modules "module_status" $@
}

start () {
    do_with_modules "module_start" $@
}

stop () {
    do_with_modules "module_stop" $@
}

force_stop () {
    do_with_modules "module_kill" $@
}

restart () {
    do_with_modules "module_stop" $@
    do_with_modules "module_start" $@
}

clean () {
    stop all
    $SEPAL/gradlew clean -p $SEPAL
}

build () {
    stop all
    $SEPAL/gradlew build -x test -x :sepal-gui:build -p $SEPAL
}

build-debug () {
    stop all
    $SEPAL/gradlew build -x test -x :sepal-gui:build -p $SEPAL --stacktrace --debug
}

log () {
    local MODULE=$1
    less $(logfile $MODULE)
}

startlog () {
    local MODULE=$1
    module_start $1
    less +F $(logfile $MODULE)
}

restartlog () {
    local MODULE=$1
    module_stop $1
    module_start $1
    less +F $(logfile $MODULE)
}

run () {
    local MODULE=$1
    case $MODULE in 
    api-gateway)
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        :sepal-api-gateway:runDev \
        -DconfigDir="$SEPAL_CONFIG/api-gateway"
        ;;
    mongo)
        mkdir -p /var/sepal/ceo/db
        mongod --dbpath /var/sepal/ceo/db
        ;;
    ceo)
        eval $(parse-yaml /etc/sepal/conf.d/secret.yml)
        export sepal_host="`dig +short myip.opendns.com @resolver1.opendns.com`:3000"
        export private_key_path=${HOME}/.ssh/google-earth-engine.key
        mkdir -p ${HOME}/.ssh/
        echo -e $google_earth_engine_private_key > $private_key_path
        pip3 install -r $SEPAL/modules/ceo/docker/requirements.txt
        sudo mkdir -p /data/cep
        sudo chmod a+rwx /data/cep
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
    gee)
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
    gui)
        cd $SEPAL/modules/gui/frontend
        npm install
        npm start
        ;;
    sepal-server)
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        :sepal-server:runDev \
        -DconfigDir="$SEPAL_CONFIG/sepal-server" 
            #-DskipSceneMetaDataUpdate
        ;;
    task-executor)
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        :task-executor:runDev --args="$SEPAL_CONFIG/task-executor/task-executor.properties"
        ;;
    user)
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        :sepal-user:runDev \
        -DconfigDir="$SEPAL_CONFIG/user"
        ;;
    *)
        return 1
        ;;
    esac
}

usage () {
    if [ ! -z "$1" ]; then
        echo ""
        echo "Error: $1"
    fi
    echo ""
    echo "Usage: $0 <command> [<arguments>]"
    echo ""
    echo "Commands:"
    echo "   clean                        clean SEPAL"
    echo "   build                        build SEPAL"
    echo "   build-debug                  build SEPAL w/debug enabled"
    echo "   status      [<module>...]    check module(s)"
    echo "   start       [<module>...]    start module(s)"
    echo "   stop        [<module>...]    stop module(s)"
    echo "   restart     [<module>...]    restart module(s)"
    echo "   run         <module>         run module interactively"
    echo "   log         <module>         show module log"
    echo "   startlog    <module>         start a module and show log tail"
    echo "   restartlog  <module>         restart a module and show log tail"

    echo ""
    echo "Modules: ${SEPAL_MODULES[@]}"
    echo ""
    exit 1
}

no_one_argument () {
    usage "Too many arguments"
}

[ -z "$1" ] && usage

case "$1" in
    clean)
        shift
        clean
        ;;
    build)
        shift
        build
        ;;
    build-debug)
        shift
        build-debug
        ;;
    status)
        shift
        status $@
        ;;
    start)
        shift
        start $@
        ;;
    restart)
        shift
        restart $@
        ;;
    stop)
        shift
        stop $@
        ;;
    run)
        shift
        if [[ $# -ne 1 ]]; then
            no_one_argument
        else
            run $1
        fi
        ;;
    log)
        shift
        if [[ $# -ne 1 ]]; then
            no_one_argument
        else
            log $1
        fi
        ;;
    startlog)
        shift
        if [[ $# -ne 1 ]]; then
            no_one_argument
        else
            startlog $1
        fi
        ;;
    restartlog)
        shift
        if [[ $# -ne 1 ]]; then
            no_one_argument
        else
            restartlog $1
        fi
        ;;
    *)
        usage
        ;;
esac
