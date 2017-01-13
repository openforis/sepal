/**
 * @author Mino Togna
 */
var EventBus  = require( '../../../../event/event-bus' )
var Events    = require( '../../../../event/events' )
var MapLoader = require( '../../../../map-loader/map-loader' )
var MapLayer  = require( './map-layer' )

var google = null
var map    = null
var layers = {}

var init = function ( domId ) {
    
    MapLoader.loadMap( domId, function ( m, g ) {
        map    = m
        google = g
        
        google.maps.event.addListenerOnce( map, 'idle', function () {
            EventBus.dispatch( Events.APPS.DATA_VIS.MAP_INITIALIZED )
        } );
        
    } )
}

var mapInitialized = function () {
    map.addListener( 'tilesloaded', function () {
        EventBus.dispatch( Events.APPS.DATA_VIS.MAP_TILES_LOADED )
    } )
}

var addLayer = function ( e, layer ) {
    var l = layers[ layer.id ]
    if ( !l ) {
        l                  = MapLayer.newInstance( layer )
        layers[ layer.id ] = l
    }
    map.overlayMapTypes.setAt( layer.index, l.imageMapType )
    l.imageMapType.setOpacity( l.opacity )
}

var removeLayer = function ( e, layer ) {
    map.overlayMapTypes.setAt( layer.index, null )
}

var changeLayerOpacity = function ( e, layerId, opacity ) {
    var l     = layers[ layerId ]
    l.opacity = parseFloat( opacity )
    l.imageMapType.setOpacity( l.opacity )
}

var zoomToLayer = function ( e, layerId ) {
    var l            = layers[ layerId ]
    var bounds       = l.properties.bounds
    var sw           = { lat: bounds[ 0 ][ 0 ], lng: bounds[ 0 ][ 1 ] }
    var ne           = { lat: bounds[ 1 ][ 0 ], lng: bounds[ 1 ][ 1 ] }
    var latLngBounds = new google.maps.LatLngBounds( sw, ne )
    map.fitBounds( latLngBounds )
}

EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_INITIALIZED, mapInitialized )
// layer events
EventBus.addEventListener( Events.APPS.DATA_VIS.ADD_MAP_LAYER, addLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.REMOVE_MAP_LAYER, removeLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_LAYER_CHANGE_OPACITY, changeLayerOpacity )
EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_LAYER_ZOOM_TO, zoomToLayer )

module.exports = {
    init: init
}