/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './logout-v' )

var init = function () {
    View.init()
    setTimeout( View.show, 3500 )
}

var onNavMenuLoaded = function () {
    setTimeout( View.show, 3500 )
}

EventBus.addEventListener( Events.APP.LOAD, init )

// EventBus.addEventListener( Events.USER.USER_DETAILS_LOADED, init )
// EventBus.addEventListener( Events.SECTION.NAV_MENU.LOADED, onNavMenuLoaded )

EventBus.addEventListener( Events.SECTION.SHOW, View.show )
EventBus.addEventListener( Events.SECTION.REDUCE, View.hide )