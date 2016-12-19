/**
 * @author Mino Togna
 */

var EventBus               = require( '../event/event-bus' )
var Events                 = require( '../event/events' )
var GoogleMapsLoader       = require( 'google-maps' )
GoogleMapsLoader.LIBRARIES = [ 'drawing' ]

require( './../map-style/map.scss' )
var mapStyle = require( './../map-style/map-style' )

var map  = null
var init = function () {
    var template = require( './map-visualization.html' )
    var html     = $( template( {} ) )
    $( '.app' ).append( html )
    
    initMap()
}

var initMap = function () {
    retrieveApiKey( function ( apiKey ) {
        GoogleMapsLoader.KEY = apiKey
        GoogleMapsLoader.load( function ( google ) {
            map = new google.maps.Map( document.getElementById( 'map-visualization' ), {
                zoom             : 3,
                minZoom          : 3,
                maxZoom          : 11,
                center           : new google.maps.LatLng( 16.7794913, 9.6771556 ),
                mapTypeId        : google.maps.MapTypeId.ROADMAP,
                zoomControl      : false,
                // zoomControlOptions: {
                //     position: google.maps.ControlPosition.BOTTOM_CENTER
                //     , style : google.maps.ZoomControlStyle.LARGE
                // },
                mapTypeControl   : false,
                scaleControl     : false,
                streetViewControl: false,
                rotateControl    : false,
                fullscreenControl: false,
                backgroundColor  : '#131314'
                
            } )
            
            map.setOptions( { styles: mapStyle } )
            
            map.addListener( 'zoom_changed', function () {
                EventBus.dispatch( Events.MAP_VIS.ZOOM_CHANGED, null, map.getZoom() )
            } )
            
        } )
        
    } )
}

var retrieveApiKey = function ( callback ) {
    var params = {
        url      : '/api/data/google-maps-api-key'
        , success: function ( response ) {
            callback( response.apiKey )
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

// var zoomTo = function ( address ) {
//     GoogleMapsLoader.load( function ( google ) {
//
//         var geocoder = new google.maps.Geocoder()
//         geocoder.geocode( { 'address': address }, function ( results, status ) {
//             if ( status == google.maps.GeocoderStatus.OK ) {
//                 map.panTo( results[ 0 ].geometry.location )
//                 map.fitBounds( results[ 0 ].geometry.viewport )
//             }
//         } )
//
//     } )
// }
//
// var setZoom = function ( zoom ) {
//     map.setZoom( zoom )
// }

module.exports = {
    init     : init
    // , zoomTo : zoomTo
    // , setZoom: setZoom
}