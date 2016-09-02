/**
 * @author Mino Togna
 */

var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Container   = null

var init = function ( container ) {
    Container = container
}

module.exports = {
    init: init
}