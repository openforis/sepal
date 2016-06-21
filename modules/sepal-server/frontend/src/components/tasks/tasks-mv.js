/**
 * @author Mino Togna
 */
var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Loader    = require( '../loader/loader' )
var Animation = require( '../animation/animation' )
var NavMenu   = require( '../nav-menu/nav-menu' )
var Model     = require( './tasks-m' )
var View      = require( './tasks-v' )

var jobTimer      = null
var navMenuButton = null
var initialized   = false

var init = function ( e ) {
    if ( !initialized ) {
        View.init()
        
        navMenuButton = NavMenu.btnTasks()
        
        setTimeout( function () {
            jobTimer = setInterval( requestTasks, 1000 )
        }, 1000 )
        
        initialized = true
    }
}

var requestTasks = function ( callback ) {
    var params = {
        url      : '/api/tasks'
        , success: function ( tasks ) {
            Model.setTasks( tasks )
            
            if ( Model.isEmpty() ) {
                Animation.animateOut( navMenuButton )
                navMenuButton.find( 'i' ).removeClass( 'fa-spin' )
            } else {
                Animation.animateIn( navMenuButton )
                
                if ( Model.isActive() ) {
                    navMenuButton.find( 'i' ).addClass( 'fa-spin' )
                } else {
                    navMenuButton.find( 'i' ).removeClass( 'fa-spin' )
                }

                View.setTasks( Model.getTasks() )
            }

            if ( callback )
                callback()
        }
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

    switch ( evt.type ) {
        case Events.SECTION.TASK_MANAGER.CANCEL_TASK:
            op = 'cancel'
            break
        case Events.SECTION.TASK_MANAGER.EXECUTE_TASK:
            op = 'execute'
            break
        case Events.SECTION.TASK_MANAGER.REMOVE_TASK:
            op       = 'remove'
            callback = function () {
                // from model is not necessary, because all tasks have been reloaded from server
                // Model.removeTask( taskId )
                View.removeTask( taskId )
            }
            break
    }

    var url = '/api/tasks/task/' + taskId + '/' + op

    postTaskAction( url, callback )
}


EventBus.addEventListener( Events.SECTION.SHOW, init )

EventBus.addEventListener( Events.SECTION.TASK_MANAGER.CANCEL_TASK, taskAction )
EventBus.addEventListener( Events.SECTION.TASK_MANAGER.REMOVE_TASK, taskAction )
EventBus.addEventListener( Events.SECTION.TASK_MANAGER.EXECUTE_TASK, taskAction )