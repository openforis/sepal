/**
 * @author Mino Togna
 */

var tasks = []

var setTasks = function ( array ) {
    tasks = array
}

var getTasks = function () {
    return tasks
}

var isEmpty = function () {
    return tasks.length <= 0
}

var isActive = function () {
    var running = false
    $.each( tasks, function ( i, task ) {
        if ( task.status === STATUS.ACTIVE ) {
            running = true
            return false
        }
    } )
    return running
}

var STATUS = {
    ACTIVE     : 'ACTIVE'
    , PENDING  : 'PENDING'
    , COMPLETED: 'COMPLETED'
    , FAILED   : 'FAILED'
}

module.exports = {
    setTasks  : setTasks
    , getTasks: getTasks
    , isEmpty : isEmpty
    , isActive: isActive
    , STATUS  : STATUS
}