/**
 * @author Mino Togna
 */


var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
// var Loader     = require( '../loader/loader' )
var View     = require( './process-v' )

var show = function ( e, type ) {
    if ( type == 'process' ) {
        View.init()
    }
}

EventBus.addEventListener( Events.SECTION.SHOW, show )
