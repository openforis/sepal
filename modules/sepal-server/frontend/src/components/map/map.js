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
var google     = null
var map        = null
//fusion table id
var FT_TableID = "15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F"

// AOI layers
var aoiLayer          = null
var aoiDrawingManager = null
var aoiDrawnPolygon   = null

var show = function () {
    var template = require( './map.html' )
    html         = $( template( {} ) )
    
    $( '.app' ).append( html )
    
    //load map
    MapLoader.loadMap( 'map', function ( m, g ) {
        map    = m
        google = g
        map.addListener( 'zoom_changed', function () {
            EventBus.dispatch( Events.MAP.ZOOM_CHANGED, null, map.getZoom() )
        } )
    } )
}

var zoomTo = function ( e, address ) {
    if ( aoiLayer ) {
        aoiLayer.setMap( null )
    }
    
    // MapLoader.load( function ( google ) {
    
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
    // } )
}

var addLayer = function ( e, layer ) {
    if ( layer ) {
        layer.setMap( map )
    }
}

var addDrawnAoiLayer = function ( e, layer ) {
    if ( layer ) {
        layer.setMap( map )
        aoiDrawingManager = layer
    }
}

var removeDrawnAoiLayer = function ( e, layer ) {
    if ( layer ) {
        layer.setMap( null )
        aoiDrawingManager = null
        aoiDrawnPolygon   = null
    }
}

var addEEMosaic = function ( e, index, mapType ) {
    map.overlayMapTypes.setAt( index, mapType )
    
    if ( aoiLayer ) {
        var opts = {
            styles: [ {
                polygonOptions: {
                    fillColor    : "#FBFAF2",
                    fillOpacity  : 0.000000000000000000000000000001,
                    strokeColor  : '#FBFAF2',
                    strokeOpacity: 0.15,
                    strokeWeight : 1
                }
            } ]
        }
        aoiLayer.setOptions( opts )
    }
    
    if( aoiDrawnPolygon ){
        var opts = {
            fillColor    : "#FBFAF2",
            fillOpacity  : 0.000000000000000000000000000001,
            strokeColor  : '#FBFAF2',
            strokeOpacity: 0.15,
            strokeWeight : 1,
            clickable    : false,
            editable     : false,
            zIndex       : 1
        }
    }
    aoiDrawnPolygon.setOptions( opts )
    
    console.log( aoiDrawnPolygon , aoiDrawingManager)
}

var removeEEMosaic = function ( e, index ) {
    if ( map.overlayMapTypes.getAt( index ) ) {
        map.overlayMapTypes.removeAt( index )
    }
    console.log( aoiDrawnPolygon , aoiDrawingManager)
    
    if ( aoiLayer ) {
        var opts = {
            styles: [ {
                polygonOptions: {
                    fillColor    : "#FBFAF2",
                    fillOpacity  : 0.07,
                    strokeColor  : '#FBFAF2',
                    strokeOpacity: 0.15,
                    strokeWeight : 1
                }
            } ]
        }
        aoiLayer.setOptions( opts )
    }
    
    if( aoiDrawnPolygon ){
        var opts = {
            fillColor    : "#FBFAF2",
            fillOpacity  : 0.07,
            strokeColor  : '#FBFAF2',
            strokeOpacity: 0.15,
            strokeWeight : 1,
            clickable    : false,
            editable     : false,
            zIndex       : 1
        }
    }
    aoiDrawnPolygon.setOptions( opts )
}

var onAppShow = function ( e, type, params ) {
    var removeLayer = function ( layer ) {
        if ( layer ) {
            setTimeout( function () {
                layer.setMap( null )
            }, 200 )
        }
    }
    if ( !(params && params.keepAoiLayerVisible) ) {
        removeLayer( aoiLayer )
        removeLayer( aoiDrawnPolygon )
    }
}

var onAppReduce = function ( e, type ) {
    var addLayer = function ( layer ) {
        if ( layer ) {
            setTimeout( function () {
                layer.setMap( map )
            }, 500 )
        }
    }
    addLayer( aoiLayer )
    addLayer( aoiDrawnPolygon )
}

var ploygonDrawn = function ( e, polygonGeoJSON, polygon ) {
    if ( aoiLayer ) {
        aoiLayer.setMap( null )
        aoiLayer = null
    }
    aoiDrawnPolygon = polygon
}

EventBus.addEventListener( Events.APP.LOAD, show )
EventBus.addEventListener( Events.MAP.ZOOM_TO, zoomTo )
EventBus.addEventListener( Events.MAP.ADD_LAYER, addLayer )
EventBus.addEventListener( Events.MAP.POLYGON_DRAWN, ploygonDrawn )

EventBus.addEventListener( Events.MAP.ADD_EE_MOSAIC, addEEMosaic )
EventBus.addEventListener( Events.MAP.REMOVE_EE_MOSAIC, removeEEMosaic )

EventBus.addEventListener( Events.MAP.ADD_DRAWN_AOI_LAYER, addDrawnAoiLayer )
EventBus.addEventListener( Events.MAP.REMOVE_DRAWN_AOI_LAYER, removeDrawnAoiLayer )

EventBus.addEventListener( Events.SECTION.SHOW, onAppShow )
EventBus.addEventListener( Events.SECTION.REDUCE, onAppReduce )