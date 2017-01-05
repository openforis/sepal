/**
 * @author Mino Togna
 */
require( './../map-style/map.scss' )
var mapStyle = require( './../map-style/map-style.js' )
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var GoogleMapsLoader       = require( 'google-maps' )
GoogleMapsLoader.LIBRARIES = [ 'drawing' ]

var retrieveApiKey = function ( callback ) {
    var params = {
        url      : '/api/data/google-maps-api-key'
        , success: function ( response ) {
            callback( response.apiKey )
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var load = function ( callback ) {
    GoogleMapsLoader.load( function ( google ) {
        if ( callback ) {
            callback( google )
        }
    } )
}

var loadMap = function ( domId, callback ) {
    retrieveApiKey( function ( apiKey ) {
        GoogleMapsLoader.KEY = apiKey
        load( function ( google ) {
            var map = new google.maps.Map( document.getElementById( domId ), {
                zoom             : 3,
                minZoom          : 3,
                maxZoom          : 15,
                center           : new google.maps.LatLng( 16.7794913, 9.6771556 ),
                mapTypeId        : google.maps.MapTypeId.ROADMAP,
                zoomControl      : false,
                mapTypeControl   : false,
                scaleControl     : false,
                streetViewControl: false,
                rotateControl    : false,
                fullscreenControl: false,
                backgroundColor  : '#131314'
                
            } )
            
            map.setOptions( { styles: mapStyle } )
            
            if ( callback ) {
                callback( map )
            }
        } )
        
    } )
}

module.exports = {
    loadMap: loadMap
    , load : load
}
