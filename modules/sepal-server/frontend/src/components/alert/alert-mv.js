/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './alert-v' )

var init = function () {
    View.init()
}

var showMessage = function ( e, msg ) {
    if ( msg ) {
        switch ( e.type ) {
            case Events.ALERT.SHOW_INFO :
                View.showInfo( msg )
                break
        }
    }
}

EventBus.addEventListener( Events.APP.LOAD, init )
EventBus.addEventListener( Events.ALERT.SHOW_INFO, showMessage )