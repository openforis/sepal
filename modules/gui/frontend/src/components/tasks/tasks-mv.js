/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )

var Model = require( './tasks-m' )
var View  = require( './tasks-v' )

var jobTimer = null

var init = function ( e ) {
    View.init()
    
    startJob()
}

var stopJob = function ( e ) {
    if ( jobTimer ) {
        clearTimeout( jobTimer )
        jobTimer = null
    }
}


var startJob = function () {
    if ( !jobTimer ) {
        // jobTimer = 1
        // jobTimer = setInterval( requestTasks, 5000 )
        
        var executeTaskRequest = function () {
            // if ( jobTimer ) {
            jobTimer = setTimeout( function () {
                requestTasks( executeTaskRequest )
            }, 5000 )
            // }
        }
        
        requestTasks( executeTaskRequest )
    }
}

var requestTasks = function ( callback ) {
    var params = {
        url      : '/api/tasks'
        , success: function ( tasks ) {
            Model.setTasks( tasks )
            
            if ( !Model.isEmpty() ) {
                View.setTasks( Model.getTasks() )
            }
            
            EventBus.dispatch( Events.SECTION.TASK_MANAGER.UPDATED )
            
            if ( callback )
                callback()
        }
        , error  : function () { }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var postTaskAction = function ( url, callback ) {
    var params = {
        url         : url
        , type      : 'POST'
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function () {
            
            requestTasks( function () {
                Loader.hide( { delay: 200 } )
                
                if ( callback ) {
                    callback()
                }
            } )
            
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var taskAction = function ( evt, taskId ) {
    var callback = null
    var op       = ''
    
    var removeTask = function () {
        // from model is not necessary, because all tasks have been reloaded from server
        // Model.removeTask( taskId )
        View.removeTask( taskId )
    }
    
    switch ( evt.type ) {
        case Events.SECTION.TASK_MANAGER.CANCEL_TASK:
            op = 'cancel'
            break
        case Events.SECTION.TASK_MANAGER.EXECUTE_TASK:
            op       = 'execute'
            callback = removeTask
            break
        case Events.SECTION.TASK_MANAGER.REMOVE_TASK:
            op       = 'remove'
            callback = removeTask
            break
    }
    
    var url = '/api/tasks/task/' + taskId + '/' + op
    
    postTaskAction( url, callback )
}

var checkStatus = function () {
    requestTasks()
}

EventBus.addEventListener( Events.APP.LOAD, init )
// EventBus.addEventListener( Events.SECTION.SHOW, startJob )
EventBus.addEventListener( Events.APP.DESTROY, stopJob )

EventBus.addEventListener( Events.SECTION.TASK_MANAGER.CANCEL_TASK, taskAction )
EventBus.addEventListener( Events.SECTION.TASK_MANAGER.REMOVE_TASK, taskAction )
EventBus.addEventListener( Events.SECTION.TASK_MANAGER.EXECUTE_TASK, taskAction )

EventBus.addEventListener( Events.SECTION.TASK_MANAGER.CHECK_STATUS, checkStatus )