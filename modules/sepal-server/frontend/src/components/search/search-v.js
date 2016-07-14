/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

// html
var template = require( './search.html' )
var html     = $( template( {} ) )
// ui components
var section  = null
var Form     = require( './search-form' )

var init = function () {
    var appSection = $( '#app-section' ).find( '.search' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        section = appSection.find( '#search' )
        
        Form.init( section.find( 'form' ) )
    }
}

module.exports = {
    init  : init
    , Form: Form
}