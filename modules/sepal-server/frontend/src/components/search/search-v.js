/**
 * @author Mino Togna
 */
require( './search.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

// html
var html    = null
// ui components
var section = null
var Form    = require( './views/search-form' )

var init = function () {
    var template = require( './search.html' )
    html         = $( template( {} ) )
    
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