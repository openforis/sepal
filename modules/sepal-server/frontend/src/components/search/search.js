/**
 * @author Mino Togna
 */
require( './search.css' )
require( 'devbridge-autocomplete' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var SceneAreasSearch = require( './scene-areas-search' )
require( './scene-images-selection' )

// html
var template = require( './search.html' )
var html     = $( template( {} ) )

// html inner sections
var section = null

var show = function ( e, type ) {

    if ( type == 'search' ) {
        var appSection = $( '#app-section' ).find( '.search' )
        if ( appSection.children().length <= 0 ) {
            appSection.append( html )

            section = appSection.find( '#search' )
            SceneAreasSearch.setForm( section.find( 'form' ) )
        }
    }

}


EventBus.addEventListener( Events.SECTION.SHOW, show )