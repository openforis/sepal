/**
 * @author Mino Togna
 */

require( './users.scss' )

var EventBus        = require( '../event/event-bus' )
var Events          = require( '../event/events' )

var template          = require( './users.html' )
var html              = $( template( {} ) )

var init = function () {
    var appSection = $( '#app-section' ).find( '.users' )
    
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
    }
    
}


module.exports = {
    init : init
}