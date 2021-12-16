#!/bin/bash
set -e

SEPAL_CONFIG=/etc/sepal/module.d
SEPAL=/usr/local/lib/sepal
SEPAL_MODULES=(user sepal-server gateway app-manager task gee gui user-storage terminal email sys-monitor user-files)
SEPAL_PSEUDO_MODULES=(shared)
SEPAL_GROUPS=(all dev node)
SEPAL_DEFAULT_GROUP=dev
LOG_DIR=/var/log/sepal

init () {
  cd $SEPAL
  ./gradlew clean build -x test
  cd $SEPAL/lib/js/shared && rm -rf package-lock.json node-modules && npm install
  cd $SEPAL
}

is_module () {
    local NAME=$1
    printf '%s\n' ${SEPAL_MODULES[@]} | grep -qP "^$NAME$"
}

is_pseudomodule () {
    local NAME=$1
    printf '%s\n' ${SEPAL_PSEUDO_MODULES[@]} | grep -qP "^$NAME$"
}

is_group () {
    local NAME=$1
    printf '%s\n' ${SEPAL_GROUPS[@]} | grep -qP "^$NAME$"
}

group () {
    local GROUP=$1
    case $GROUP in
    all)
        echo "${SEPAL_MODULES[@]}"
        ;;
    dev)
        echo "user sepal-server ( -DskipSceneMetaDataUpdate ) app-manager email gateway gee gui sys-monitor task terminal user-files user-storage"
        ;;
    node)
        echo "app-manager email gateway gee sys-monitor task terminal user-files user-storage"
        ;;
    *)
        return 1
        ;;
    esac
}

gpidof () {
    local MODULE=$1
    ps axho pgid,args | grep -E "/bin/bash" | grep -E "$0 run ${MODULE}(\s|$)" | head -n 1 | awk '{ print $1 }'
}

is_running () {
    local MODULE=$1
    local PID=$(gpidof ${MODULE})
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
    RED)
        COLOR='\033[0;31m'
        ;;
    LIGHT_RED)
        COLOR='\033[1;31m'
        ;;
    GREEN)
        COLOR='\033[0;32m'
        ;;
    LIGHT_GREEN)
        COLOR='\033[1;32m'
        ;;
    YELLOW)
        COLOR='\033[0;33m'
        ;;
    *)
        COLOR=$NO_COLOR # No Color
        ;;
    esac
    printf "${COLOR}%10s${NO_COLOR} ${MODULE}\n" "${MESSAGE}"
}

module_status () {
    local MODULE=$1
    if is_running $MODULE; then
        message "STARTED" $MODULE GREEN
    else
        message "STOPPED" $MODULE RED
    fi
}

module_start () {
    local MODULE=$1
    shift
    local ARGS=$@
    local PID=$(gpidof ${MODULE})
    if [[ -z "$PID" ]]; then
        local LOG=$(logfile $MODULE)
        message "STARTING" "$MODULE $ARGS" LIGHT_GREEN
        setsid nohup /bin/bash $0 run $MODULE $ARGS >$LOG 2>&1 &
    else
        message "STARTED" $MODULE GREEN
    fi
}

group_processes_terminated () {
    local PID=$1
    local TIMEOUT=10
    until [[ -z "$(pgrep -g $PID)" || "$((TIMEOUT--))" -eq 0 ]] ; do
        sleep 1
    done
    [[ -z "$(pgrep -g $PID)" ]]
}

module_stop () {
    local MODULE=$1
    local PID=$(gpidof $MODULE)
    if [[ -z "$PID" ]]; then
        message "STOPPED" $MODULE RED
    else
        message "STOPPING" $MODULE LIGHT_RED
        sudo pkill -TERM -g $PID
        group_processes_terminated $PID || sudo pkill -KILL -g $PID
    fi
}

module_kill () {
    local MODULE=$1
    local PID=$(gpidof $MODULE)
    if [[ -z "$PID" ]]; then
        message "STOPPED" $MODULE RED
    else
        message "KILLING" $MODULE LIGHT_RED
        sudo pkill -KILL -g $PID
    fi
}

module_log () {
    local MODULE=$1
    less -R +F $(logfile $MODULE)
}

module_clean () {
    local MODULE=$1
    message "CLEANING" $MODULE YELLOW
    case $MODULE in
    shared)
        (cd $SEPAL/lib/js/shared && rm -rf node_modules/ package-lock.json)
        ;;
    gui)
        (cd $SEPAL/modules/gui/frontend && rm -rf node_modules package-lock.json)
        ;;
    sepal-server)
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        :sepal-common:clean &>/dev/null
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        :sepal-server:clean &>/dev/null
        ;;
    user)
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        :sepal-common:clean &>/dev/null
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        :sepal-user:clean &>/dev/null
        ;;
    *)
        (cd $SEPAL/modules/$MODULE && rm -rf node_modules package-lock.json)
        ;;
    esac
}

module_update () {
    local MODULE=$1
    message "UPDATING" $MODULE YELLOW
    case $MODULE in
    shared)
        (cd $SEPAL/lib/js/shared && ncu -i)
        ;;
    gui)
        (cd $SEPAL/modules/gui/frontend && ncu -i)
        ;;
    *)
        (cd $SEPAL/modules/$MODULE && ncu -i)
        ;;
    esac
}

module_install () {
    local MODULE=$1
    message "INSTALLING" $MODULE YELLOW
    case $MODULE in
    shared)
        (cd $SEPAL/lib/js/shared && npm install)
        ;;
    gui)
        (cd $SEPAL/modules/gui/frontend && npm install)
        ;;
    *)
        (cd $SEPAL/modules/$MODULE && npm install)
        ;;
    esac
}

run () {
    local MODULE=$1
    shift
    local ARGS=$@
    case $MODULE in
    gui)
        (cd $SEPAL/modules/gui/frontend && npm start)
        ;;
    sepal-server)
        $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        --stacktrace \
        :sepal-server:runDev \
        -DconfigDir="$SEPAL_CONFIG/sepal-server" \
        $ARGS
        ;;
    user)
        sudo $SEPAL/gradlew \
        -p $SEPAL \
        --no-daemon \
        --stacktrace \
        :sepal-user:runDev \
        -DconfigDir="$SEPAL_CONFIG/user" \
        $ARGS
        ;;
    *)
        (cd $SEPAL/modules/$MODULE && SEPAL_CONFIG=$SEPAL_CONFIG npm run dev)
        ;;
    esac
}

do_with_modules () {
    local COMMANDS=$1
    shift
    local NAMES=$@

    local ARGS_START="("
    local ARGS_STOP=")"
    local CURRENT_NAME
    local IS_ARG=false
    local ARGS

    NAMES+=" -"
    for NAME in $NAMES; do
        if [[ $NAME == $ARGS_START ]]; then
            IS_ARG=true
        elif [[ $NAME == $ARGS_STOP ]]; then
            IS_ARG=false
        else
            if ($IS_ARG); then
                ARGS+=($NAME)
            else
                if [[ $NAME != $CURRENT_NAME ]]; then
                    if [[ $CURRENT_NAME != "" ]]; then
                        if is_group $CURRENT_NAME; then
                            local GROUP=$CURRENT_NAME
                            local MODULES="$(group $GROUP)"
                            do_with_modules "$COMMANDS" $MODULES
                        elif is_module $CURRENT_NAME || is_pseudomodule $CURRENT_NAME; then
                            local MODULE=$CURRENT_NAME
                            for COMMAND in $COMMANDS; do
                                $COMMAND $MODULE "${ARGS[@]}"
                            done
                        else
                            message "IGNORED" $CURRENT_NAME YELLOW
                        fi
                    fi
                    CURRENT_NAME=$NAME
                    ARGS=()
                fi
            fi
        fi
    done
}

status () {
    do_with_modules "module_status" ${@:-all}
}

start () {
    do_with_modules "module_start" ${@:-$SEPAL_DEFAULT_GROUP}
}

stop () {
    do_with_modules "module_stop" ${@:-all}
}

force_stop () {
    do_with_modules "module_kill" ${@:-all}
}

restart () {
    do_with_modules "module_stop" ${@:-all}
    do_with_modules "module_start" ${@:-SEPAL_DEFAULT_GROUP}
}

clean () {
    do_with_modules "module_stop" ${@:-all}
    do_with_modules "module_clean" ${@:-all}
}

build () {
    stop sepal-server user
    $SEPAL/gradlew build -x test -x :sepal-gui:build -p $SEPAL
}

build-debug () {
    stop sepal-server user
    $SEPAL/gradlew build -x test -x :sepal-gui:build -p $SEPAL --stacktrace --debug
}

tail () {
    if [[ $# -gt 0 ]]; then
        local MODULES=$@
        local LOGFILES=()
        for MODULE in $MODULES; do
            if is_module $MODULE; then
                LOGFILES+=($(logfile $MODULE))
            else
                message "UNKNOWN" $MODULE YELLOW
                return
            fi
        done
        multitail -CT ANSI ${LOGFILES[@]}
    else
        multitail -CT ANSI $LOG_DIR/*.log
    fi
}

log () {
    local MODULE=$1
    do_with_modules "module_log" $MODULE
}

startlog () {
    local MODULE=$1
    do_with_modules "module_start module_log" $MODULE
}

restartlog () {
    local MODULE=$1
    do_with_modules "module_stop module_start module_log" $MODULE
}

foo () {
    echo "foo: $@"
}

update () {
    do_with_modules "module_update" shared
    do_with_modules "module_update" node
    do_with_modules "module_update" gui
    do_with_modules "module_stop" node
    do_with_modules "module_stop" gui
    do_with_modules "module_clean module_install" shared
    do_with_modules "module_clean module_install" node
    do_with_modules "module_clean module_install" gui
}

update-gui () {
    do_with_modules "module_update" gui
    do_with_modules "module_stop" gui
    do_with_modules "module_clean module_install" gui
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
    echo "   init                         first build of SEPAL"
    echo "   build                        build SEPAL"
    echo "   build-debug                  build SEPAL w/debug enabled"
    echo "   update                       update all npm packages"
    echo "   update-gui                   update gui npm packages"
    echo "   clean       [<module>...]    clean module(s)/group(s)"
    echo "   status      [<module>...]    check module(s)/group(s)"
    echo "   start       [<module>...]    start module(s)/group(s)"
    echo "   stop        [<module>...]    stop module(s)/group(s)"
    echo "   restart     [<module>...]    restart module(s)/group(s)"
    echo "   tail        [<module>...]    show combined module(s) log tail"
    echo "   log         <module>         show module log (tail)"
    echo "   run         <module>         run module interactively"
    echo "   startlog    <module>         start a module and show log tail"
    echo "   restartlog  <module>         restart a module and show log tail"
    echo ""
    echo "Definitions:"
    echo "   <module>: <module_name> [<module_args>]"
    echo "   <module_args>: ( <module_arg>... )"
    echo ""
    echo "Modules: ${SEPAL_MODULES[@]}"
    echo "Groups: ${SEPAL_GROUPS[@]}"
    echo ""
    exit 1
}

enforce_one_argument () {
    local COMMAND=$1, ARG_COUNT=$2
    if [[ $ARG_COUNT -ne 1 ]]; then
        usage "command '$1' requires one argument"
    fi
}

enforce_zero_arguments () {
    local COMMAND=$1, ARG_COUNT=$2
    if [[ $ARG_COUNT -ne 0 ]]; then
        usage "command '$1' requires no arguments"
    fi
}

[ -z "$1" ] && usage

case "$1" in
    init)
      shift
      init $@
      ;;
    clean)
        shift
        clean $@
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
        run $@
        ;;
    tail)
        shift
        tail $@
        ;;
    update)
        shift
        enforce_zero_arguments update $#
        update
        ;;
    update-gui)
        shift
        enforce_zero_arguments update $#
        update-gui
        ;;
    log)
        shift
        enforce_one_argument startlog $#
        log $1
        ;;
    startlog)
        shift
        enforce_one_argument startlog $#
        startlog $1
        ;;
    restartlog)
        shift
        enforce_one_argument restartlog $#
        restartlog $1
        ;;
    *)
        usage
        ;;
esac
