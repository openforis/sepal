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
        } )
        
        google.maps.event.addListener( map, 'click', function ( event ) {
            console.log( event.latLng )
            var lat = event.latLng.lat()
            var lng = event.latLng.lng()
            EventBus.dispatch( Events.APPS.DATA_VIS.GET_FEATURE_INFO, null, lat, lng )
        } )
        
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
    l.imageMapType.setOpacity( layer.opacity )
}

var removeLayer = function ( e, layer ) {
    map.overlayMapTypes.setAt( layer.index, null )
}

var changeLayerOpacity = function ( e, layerId, opacity ) {
    var l                = layers[ layerId ]
    l.properties.opacity = parseFloat( opacity )
    l.imageMapType.setOpacity( l.properties.opacity )
}

var zoomToLayer = function ( e, layerId ) {
    var l = layers[ layerId ]
    if ( l ) {
        var bounds       = l.properties.bounds
        var sw           = { lat: bounds[ 0 ][ 0 ], lng: bounds[ 0 ][ 1 ] }
        var ne           = { lat: bounds[ 1 ][ 0 ], lng: bounds[ 1 ][ 1 ] }
        var latLngBounds = new google.maps.LatLngBounds( sw, ne )
        map.fitBounds( latLngBounds )
    }
}

var forceUpdateLayer = function ( e, layer ) {
    removeLayer( e, layer )
    layers[ layer.id ] = null
    addLayer( e, layer )
}

var deleteLayer = function ( e, layerId ) {
    var l = layers[ layerId ]
    map.overlayMapTypes.setAt( l.properties.index, null )
    delete layers[ layerId ]
}

EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_INITIALIZED, mapInitialized )
// layer events
EventBus.addEventListener( Events.APPS.DATA_VIS.ADD_MAP_LAYER, addLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.FORCE_UPDATE_LAYER, forceUpdateLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.REMOVE_MAP_LAYER, removeLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_LAYER_CHANGE_OPACITY, changeLayerOpacity )
EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_LAYER_ZOOM_TO, zoomToLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.LAYER_DELETE, deleteLayer )

module.exports = {
    init: init
}