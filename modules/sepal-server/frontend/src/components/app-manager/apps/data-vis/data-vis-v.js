/**
 * @author Mino Togna
 */

var EventBus  = require( '../../../event/event-bus' )
var Events    = require( '../../../event/events' )
var MapLoader = require( '../../../map-loader/map-loader' )

var html = null
var map  = null

var show = function ( container ) {
    if ( container.find( '.data-vis-app' ).length <= 0 ) {
        init( container )
    }
    html.show()
}

var init = function ( container ) {
    var template = require( './data-vis.html' )
    html         = $( template( {} ) )
    container.append( html )
    
    MapLoader.loadMap( 'map-data-vis', function ( m ) {
        map = m
    } )
}

module.exports = {
    show: show
}