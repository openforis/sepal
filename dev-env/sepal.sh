#!/bin/bash
set -e 

SEPAL_CONFIG=/etc/sepal/module.d
SEPAL=/usr/local/lib/sepal
SEPAL_MODULES="user sepal-server api-gateway task gee gui"

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
run-gee)
    cd $SEPAL/lib/js/shared
    npm install
    cd $SEPAL/modules/gee/docker
    npm i
    SEPAL_CONFIG=$SEPAL_CONFIG source ./dev.sh
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
run-task)
    cd $SEPAL/lib/js/shared
    npm install
    cd $SEPAL/modules/task/docker
    npm i
    SEPAL_CONFIG=$SEPAL_CONFIG source ./dev.sh
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
