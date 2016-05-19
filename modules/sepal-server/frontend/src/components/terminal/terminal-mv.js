
/**
 * @author Mino Togna
 */
// require( './terminal.css' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )

var View = require( './terminal-v' )

var show = function ( e, type ) {
    if ( type == 'terminal' ) {
        View.init()
    }
}

EventBus.addEventListener( Events.SECTION.SHOW, show )