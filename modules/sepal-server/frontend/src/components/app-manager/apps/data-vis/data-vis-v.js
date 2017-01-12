/**
 * @author Mino Togna
 */
require( './data-vis.scss' )

var EventBus = require( '../../../event/event-bus' )
var Events   = require( '../../../event/events' )

var Map    = require( './views/map' )
var Layers = require( './views/layers' )

var html           = null
var map            = null
var mapTilesLoader = null

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
    
    mapTilesLoader = html.find( '.map-tiles-loader' )
    
    Map.init( 'map-data-vis' )
    Layers.init( html )
}

var showTilesLoader = function () {
    mapTilesLoader.stop().fadeIn()
}

var hideTilesLoader = function () {
    mapTilesLoader.stop().fadeOut()
}


EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_LAYER_TILES_LOADING, showTilesLoader )
EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_TILES_LOADED, hideTilesLoader )

module.exports = {
    show      : show,
    loadLayers: Layers.load
}