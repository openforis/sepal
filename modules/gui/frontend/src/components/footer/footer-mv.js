/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './footer-v' )

var init = function () {
    View.init()
}

var updateUserBudget = function ( evt, user ) {
    View.updateUserBudget( user )
}

EventBus.addEventListener( Events.APP.LOAD, init )

EventBus.addEventListener( Events.SECTION.TASK_MANAGER.UPDATED, View.updateTasks )
EventBus.addEventListener( Events.NOTIFICATION.NOTIFICATIONS_UPDATED, View.updateNotifications )

EventBus.addEventListener( Events.USER.USER_SANDBOX_REPORT_LOADED, updateUserBudget )