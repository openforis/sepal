/**
 * @author Mino Togna
 */
var d3 = require( 'd3' )

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var MapLoader = require( '../map-loader/map-loader' )

// additional map components
require( './scene-areas-mv' )
require( './ee-map-layer' )
require( './polygon-draw' )

// html template
var html       = null
// instance variables
var map        = null
//fusion table id
var FT_TableID = "15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F"
// overlay layers
var aoiLayer   = null

var show = function () {
    var template = require( './map.html' )
    html         = $( template( {} ) )
    
    $( '.app' ).append( html )
    
    //load map
    MapLoader.loadMap( 'map', function ( m ) {
        map = m
        map.addListener( 'zoom_changed', function () {
            EventBus.dispatch( Events.MAP.ZOOM_CHANGED, null, map.getZoom() )
        } )
    } )
}

var zoomTo = function ( e, address ) {
    if ( aoiLayer ) {
        aoiLayer.setMap( null )
    }
    
    MapLoader.load( function ( google ) {
        
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
                aoiLayer.addListener( 'click', function ( e ) {
                    console.log( this )
                } )
                aoiLayer.setMap( map )
            }
        } )
    } )
}

var addLayer = function ( e, layer ) {
    if ( layer ) {
        layer.setMap( map )
    }
}

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

EventBus.addEventListener( Events.SECTION.SHOW, onAppShow )
EventBus.addEventListener( Events.SECTION.REDUCE, onAppReduce )