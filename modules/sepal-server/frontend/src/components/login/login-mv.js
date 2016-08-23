/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './login-v' )

var show     = function ( e ) {
    View.show()
}

var hide = function ( e ) {
    View.hide()
}

EventBus.addEventListener( Events.LOGIN.SHOW, show )
EventBus.addEventListener( Events.LOGIN.HIDE, hide )