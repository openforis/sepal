/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

// html
var template = require( './terminal.html' )
var html     = $( template( {} ) )
// ui components
// var section  = null

var init = function () {
    var appSection = $( '#app-section' ).find( '.terminal' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
    }
}

module.exports = {
    init: init
}