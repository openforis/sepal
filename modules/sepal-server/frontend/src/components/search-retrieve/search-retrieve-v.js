/**
 * @author Mino Togna
 */

require('./search-retrieve.css')

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

// html
var template = require( './search-retrieve.html' )
var html     = $( template( {} ) )

var mosaicBtn   = null
var retrieveBtn = null

var init = function () {
    $( '.app' ).append( html )
    
    retrieveBtn = html.find( 'button.retrieve' )
    mosaicBtn   = html.find( 'button.mosaic' )

    retrieveBtn.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH.RETRIEVE )
    } )
    mosaicBtn.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH.MOSAIC )
    } )
}

module.exports = {
    init  : init
    , show: function () {
        html.fadeIn()
    }
    , hide: function () {
        html.hide()
    }
}