/**
 * @author Mino Togna
 */
require( './map.scss' )
require( 'd3' )

var EventBus               = require( '../event/event-bus' )
var Events                 = require( '../event/events' )
var GoogleMapsLoader       = require( 'google-maps' )
GoogleMapsLoader.LIBRARIES = [ 'drawing' ]
// GoogleMapsLoader.KEY = 'qwertyuiopasdfghjklzxcvbnm'

var Sepal = require( '../main/sepal' )
// additional map components
require( './scene-areas-mv' )
require( './ee-map-layer' )
require( './polygon-draw' )

// html template
var html     = null
// google map style
var mapStyle = require( './data/map-style.js' )

// instance variables
var map = null

var FT_TableID = "15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F"

// overlay layers
var aoiLayer = null

var show = function () {
    var template = require( './map.html' )
    html         = $( template( {} ) )
    EventBus.dispatch( Events.APP.REGISTER_ELEMENT, null, html.attr( 'id' ) )
    
    $( '.app' ).append( html )
    
    GoogleMapsLoader.load( function ( google ) {
        map = new google.maps.Map( document.getElementById( 'map' ), {
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
            EventBus.dispatch(Events.MAP.ZOOM_CHANGED , null , map.getZoom())
        } )
        
    } )
}

var zoomTo = function ( e, address ) {
    if ( aoiLayer ) {
        aoiLayer.setMap( null )
    }
    
    GoogleMapsLoader.load( function ( google ) {
        
        var geocoder = new google.maps.Geocoder()
        geocoder.geocode( { 'address': address }, function ( results, status ) {
            if ( status == google.maps.GeocoderStatus.OK ) {
                map.panTo( results[ 0 ].geometry.location )
                map.fitBounds( results[ 0 ].geometry.viewport )
                
                var FT_Options = {
                    suppressInfoWindows: true,
                    query              : {
                        from  : FT_TableID,
                        select: 'geometry',
                        where : "'NAME_FAO' = '" + address + "';"
                    },
                    styles             : [ {
                        polygonOptions: {
                            fillColor    : "#FBFAF2",
                            fillOpacity  : 0.07,
                            strokeColor  : '#FBFAF2',
                            strokeOpacity: 0.15,
                            strokeWeight : 1
                        }
                    } ]
                }
                
                aoiLayer = new google.maps.FusionTablesLayer( FT_Options )
                aoiLayer.setMap( map )
            }
        } )
        
        // ************************** API KEY REQUIRED
        // https://www.googleapis.com/fusiontables/v2/query?sql=
        // var q = 'select iso_2 from ' + FT_TableID
        // EventBus.dispatch(Events.AJAX.REQUEST , null , {
        //     url : 'https://www.googleapis.com/fusiontables/v2/query'
        //     , data :{ sql : q}
        //     , success : function ( response ) {
        //         console.log( response )
        //     }
        // })
        
    } )
}

var addLayer = function ( e, layer ) {
    if ( layer ) {
        layer.setMap( map )
    }
}

// function preview() {
//     var country    = 'Italy'
//     var targetDate = new Date().getTime()
//     var sensors    = 'LANDSAT_8'
//     // var sensors = ['LANDSAT_8']
//     // sensors = sensors.join(',')
//     var years = '1'
//     var bands = 'B4, B3, B2'
//
//     $.getJSON( '/preview', { country: country, targetDate: targetDate, sensors: sensors, years: years, bands: bands },
//         function ( data ) {
//             var mapId  = data.mapId
//             var token  = data.token
//             var bounds = data.bounds
//             render( mapId, token, bounds )
//         } )
// }

var addOverlayMapType = function ( e, index, mapType ) {
    map.overlayMapTypes.setAt( index, mapType )
}

var removeOverlayMapType = function ( e, index ) {
    if ( map.overlayMapTypes.getAt( index ) ) {
        map.overlayMapTypes.removeAt( index )
    }
}

var onAppShow = function ( e, type ) {
    if ( aoiLayer ) {
        setTimeout( function () {
            aoiLayer.setMap( null )
        }, 200 )
    }
}

var onAppReduce   = function ( e, type ) {
    if ( aoiLayer ) {
        setTimeout( function () {
            aoiLayer.setMap( map )
        }, 500 )
    }
}
var clearAoiLayer = function ( e ) {
    if ( aoiLayer ) {
        aoiLayer.setMap( null )
        aoiLayer = null
    }
}

EventBus.addEventListener( Events.APP.LOAD, show )
EventBus.addEventListener( Events.MAP.ZOOM_TO, zoomTo )
EventBus.addEventListener( Events.MAP.ADD_LAYER, addLayer )
EventBus.addEventListener( Events.MAP.POLYGON_DRAWN, clearAoiLayer )

EventBus.addEventListener( Events.MAP.ADD_OVERLAY_MAP_TYPE, addOverlayMapType )
EventBus.addEventListener( Events.MAP.REMOVE_OVERLAY_MAP_TYPE, removeOverlayMapType )
// EventBus.addEventListener( Events.MAP.ADD_EE_LAYER , renderEE )


EventBus.addEventListener( Events.SECTION.SHOW, onAppShow )
EventBus.addEventListener( Events.SECTION.REDUCE, onAppReduce )