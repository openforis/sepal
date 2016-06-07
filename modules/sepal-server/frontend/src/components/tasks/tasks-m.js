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

var isActive = function (  ) {
    var running = false
    $.each( tasks , function ( i,task ) {
        if( task.status === 'ACTIVE' ){
            running = true
        }
        return
    })
    return running
}

module.exports = {
    setTasks  : setTasks
    , getTasks: getTasks
    , isEmpty : isEmpty
    , isActive : isActive
}