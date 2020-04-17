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

logfile () {
    local MODULE=$1
    echo "$LOG_DIR/$MODULE.log"
}

module_status () {
    local MODULE=$1
    if is_module $MODULE; then
        PID=$(pidof ${MODULE})
        if [ -z "$PID" ]; then
            echo "[STOPPED] ${MODULE}"
        else
            echo "[RUNNING] ${MODULE}"
        fi
    else
        echo "[NON-EXISTING] ${MODULE}"
    fi
}

module_start () {
    local MODULE=$1
    if is_module $MODULE; then
        PID=$(pidof $MODULE)
        if [ -z "$PID" ]; then
            local LOG=$(logfile $MODULE)
            nohup $0 run $MODULE >$LOG 2>&1 &
            echo "[STARTING] $MODULE"
        fi
    else
        echo "[NON-EXISTING] ${MODULE}"
    fi
}

module_stop () {
    local MODULE=$1
    if is_module $MODULE; then
        PID=$(pidof ${MODULE})
        if [ ! -z "$PID" ]; then
            pkill -P $PID
            echo "[STOPPING] $MODULE"
        fi
    else
        echo "[NON-EXISTING] ${MODULE}"
    fi
}

status () {
    local MODULE=$1
    if [ "$MODULE" == "all" ]; then
        for MODULE in "${SEPAL_MODULES[@]}"; do
            module_status $MODULE
        done
    else
        module_status $MODULE
    fi
}

start () {
    local MODULE=$1
    if [ "$MODULE" == "all" ]; then
        for MODULE in "${SEPAL_MODULES[@]}"; do
            module_start $MODULE
        done
    else
        module_start $MODULE
    fi
}

stop () {
    local MODULE=$1
    if [ "$MODULE" == "all" ]; then
        for MODULE in "${SEPAL_MODULES[@]}"; do
            module_stop $MODULE
        done
    else
        module_stop $MODULE
    fi
}

restart () {
    stop $@
    start $@
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
        echo -e "\nError: $1"
    fi
    echo "Usage: $0 <command> [<arguments>]"
    echo ""
    echo "Commands:"
    echo ""
    echo "   clean                      clean SEPAL"
    echo "   build                      build SEPAL"
    echo "   build-debug                build SEPAL w/debug enabled"
    echo ""
    echo "   start     <module> | all   start module(s)"
    echo "   stop      <module> | all   stop module(s)"
    echo "   kill      <module> | all   force stop module(s)"
    echo "   status    <module> | all   check module(s)"
    echo "   restart   <module> | all   restart module(s)"
    echo "   run       <module>         run module interactively"
    echo "   log       <module>         show module log"

    echo ""
    echo "Modules: ${SEPAL_MODULES[@]}"
    echo ""
    exit 1
}

missing_parameter () {
    usage "Missing parameter"
}

[ -z "$1" ] && usage

while [[ ! -z "$1" ]] && [[ "$RETVAL" -eq 0 ]]; do
    case "$1" in
        clean)
            clean
            shift
            ;;
        build)
            build
            shift
            ;;
        build-debug)
            build-debug
            shift
            ;;
        status)
            shift
            if [ -z "$1" ]; then
                missing_parameter
            else
                status $1
                shift
            fi
            ;;
        start)
            shift
            if [ -z "$1" ]; then
                missing_parameter
            else
                start $1
                shift
            fi
            ;;
        restart)
            shift
            if [ -z "$1" ]; then
                missing_parameter
            else
                restart $1
                shift
            fi
            ;;
        stop)
            shift   
            if [ -z "$1" ]; then
                missing_parameter
            else
                stop $1
                shift
            fi
            ;;
        run)
            shift
            if [ -z "$1" ]; then
                missing_parameter
            else
                run $1
                shift
            fi
            ;;
        log)
            shift
            if [ -z "$1" ]; then
                missing_parameter
            else
                log $1
                shift
            fi
            ;;
        *)
            usage
            ;;
    esac
done
