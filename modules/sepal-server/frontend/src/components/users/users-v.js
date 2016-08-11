/**
 * @author Mino Togna
 */

require( './users.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var template = require( './users.html' )
var html     = $( template( {} ) )

var ListSection = require( './views/list-section' )

// var SummarySection = null

var init = function () {
    var appSection = $( '#app-section' ).find( '.users' )
    
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        ListSection.init( html.find( '.list-section' ) )
        
        
        // SummarySection = html.find( '.summary' )
    }
    
}

module.exports = {
    init        : init
    , setUsers  : ListSection.setUsers
    , selectUser: ListSection.selectUser
}