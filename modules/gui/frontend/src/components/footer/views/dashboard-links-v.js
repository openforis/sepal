/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var UserMV   = require( '../../user/user-mv' )
var TasksM   = require( '../../tasks/tasks-m' )

var $container = null
var $btnTasks  = null
var $btnUsers  = null

var init = function ( container ) {
    $container = $( container )
    $btnTasks  = $container.find( '.btn-tasks' )
    $btnUsers  = $container.find( '.btn-users' )
    
    $btnTasks.click( function ( e ) {
        e.preventDefault()
        
        EventBus.dispatch( Events.SECTION.NAV_MENU.COLLAPSE )
        EventBus.dispatch( Events.SECTION.SHOW, null, 'tasks' )
    } )
    
    if ( UserMV.getCurrentUser().isAdmin() ) {
        $btnUsers.click( function ( e ) {
            e.preventDefault()
            
            EventBus.dispatch( Events.SECTION.NAV_MENU.COLLAPSE )
            EventBus.dispatch( Events.SECTION.SHOW, null, 'users' )
        } )
    } else {
        $btnUsers.remove()
    }
}

var updateTasks = function () {
    var activeCount = TasksM.activeCount()
    if ( activeCount > 0 ) {
        $btnTasks.html( '<i class="fa fa-spinner fa-pulse fa-fw margin-bottom"></i>' )
    } else {
        $btnTasks.html( '<i class="fa fa-tasks" aria-hidden="true"></i>' )
    }
}

module.exports = {
    init         : init
    , updateTasks: updateTasks
}