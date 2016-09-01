/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './logout-v' )

var onUserLoaded = function () {
    View.init()
}

var onNavMenuLoaded = function () {
    setTimeout( View.show, 3500 )
}

EventBus.addEventListener( Events.USER.USER_DETAILS_LOADED, onUserLoaded )
// EventBus.addEventListener( Events.SECTION.NAV_MENU.LOADED, onNavMenuLoaded )

EventBus.addEventListener( Events.SECTION.SHOW, View.show )
EventBus.addEventListener( Events.SECTION.REDUCE, View.hide )