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

// var getTaskIndex = function ( taskId ) {
//     var idx = -1
//     $.each( tasks, function ( i, task ) {
//         if ( task.id === taskId ) {
//             idx = i
//             return false
//         }
//     } )
//     return idx
// }
//
// var removeTask   = function ( taskId ) {
//     var idx = getTaskIndex( taskId )
//     console.log( "===== BEFORE SPLICE " + idx )
//     console.log( tasks )
//     tasks.splice( idx, 1 )
//     console.log( "===== AFTER SPLICE " + idx )
//     console.log( tasks )
// }

var STATUS = {
    ACTIVE     : 'ACTIVE'
    , PENDING  : 'PENDING'
    , COMPLETED: 'COMPLETED'
    , FAILED   : 'FAILED'
}

module.exports = {
    setTasks    : setTasks
    , getTasks  : getTasks
    , isEmpty   : isEmpty
    , isActive  : isActive
    // , removeTask: removeTask
    , STATUS    : STATUS
}