/**
 * @author Mino Togna
 */
var EventBus  = require( '../../../../event/event-bus' )
var Events    = require( '../../../../event/events' )
var MapLoader = require( '../../../../map-loader/map-loader' )
var MapLayer  = require( './map-layer' )

var map    = null
var layers = {}
var init   = function ( domId ) {
    
    MapLoader.loadMap( domId, function ( m, google ) {
        map = m
        
        google.maps.event.addListenerOnce( map, 'idle', function () {
            EventBus.dispatch( Events.APPS.DATA_VIS.MAP_INITIALIZED )
        } );
        
    } )
}

var mapInitialized = function () {
    map.addListener( 'tilesloaded', function () {
        // console.log( "TILES LOADED" )
        EventBus.dispatch( Events.APPS.DATA_VIS.MAP_TILES_LOADED )
    } )
}

var addLayer = function ( e, layer ) {
    var l              = MapLayer.newInstance( layer )
    layers[ layer.id ] = l
    map.overlayMapTypes.insertAt( layer.index, l.imageMapType )
}

var removeLayer = function ( e, layer ) {
    map.overlayMapTypes.removeAt( layer.index )
}

EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_INITIALIZED, mapInitialized )
EventBus.addEventListener( Events.APPS.DATA_VIS.ADD_MAP_LAYER, addLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.REMOVE_MAP_LAYER, removeLayer )

module.exports = {
    init: init
}