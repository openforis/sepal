/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var eeOverlayMapType = null
var LAYER_INDEX      = 0

var isVisible = true
var renderEE  = function ( e, mapId, token ) {
    onRemoveEELayer()
    
    isVisible = true
    
    var eeMapOptions = {
        getTileUrl: function ( tile, zoom ) {
            var baseUrl = 'https://earthengine.googleapis.com/map'
            var url     = [ baseUrl, mapId, zoom, tile.x, tile.y ].join( '/' )
            url += '?token=' + token
            return url
        },
        tileSize  : new google.maps.Size( 256, 256 )
    }
    
    // Create the map type.
    eeOverlayMapType = new google.maps.ImageMapType( eeMapOptions )
    EventBus.dispatch( Events.MAP.ADD_OVERLAY_MAP_TYPE, null, LAYER_INDEX, eeOverlayMapType )
}

var onRemoveEELayer = function ( e ) {
    if ( eeOverlayMapType && isVisible ) {
        EventBus.dispatch( Events.MAP.REMOVE_OVERLAY_MAP_TYPE, null, LAYER_INDEX )
    }
    eeOverlayMapType = null
}

var onShowApplicationSection = function ( e ) {
    if ( eeOverlayMapType && isVisible ) {
        EventBus.dispatch( Events.MAP.REMOVE_OVERLAY_MAP_TYPE, null, LAYER_INDEX )
    }
}

var onReduceApplicationSection = function ( e ) {
    if ( eeOverlayMapType && isVisible ) {
        EventBus.dispatch( Events.MAP.ADD_OVERLAY_MAP_TYPE, null, LAYER_INDEX, eeOverlayMapType )
    }
}

var toggleVisibility = function ( e ) {
    isVisible = !isVisible
    
    if ( !isVisible && eeOverlayMapType ) {
        EventBus.dispatch( Events.MAP.REMOVE_OVERLAY_MAP_TYPE, null, LAYER_INDEX )
    } else if ( eeOverlayMapType ) {
        EventBus.dispatch( Events.MAP.ADD_OVERLAY_MAP_TYPE, null, LAYER_INDEX, eeOverlayMapType )
    }
    
}

EventBus.addEventListener( Events.MAP.ADD_EE_LAYER, renderEE )
EventBus.addEventListener( Events.MAP.REMOVE_EE_LAYER, onRemoveEELayer )

EventBus.addEventListener( Events.SECTION.SHOW, onShowApplicationSection )
EventBus.addEventListener( Events.SECTION.REDUCE, onReduceApplicationSection )
EventBus.addEventListener( Events.MAP.EE_LAYER_TOGGLE_VISIBILITY, toggleVisibility )