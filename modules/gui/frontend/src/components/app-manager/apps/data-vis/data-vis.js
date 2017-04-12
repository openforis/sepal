/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './data-vis-v' )

var appLoad = function () {
    View.init()
}

EventBus.addEventListener( Events.APP.LOAD, appLoad )
