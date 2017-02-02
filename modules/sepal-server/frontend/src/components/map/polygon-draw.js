/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var drawingManager = null
var polygon        = null

var enable = function ( e ) {
    
    var layerOptions = {
        fillColor    : "#FBFAF2",
        fillOpacity  : 0.07,
        strokeColor  : '#FBFAF2',
        strokeOpacity: 0.15,
        strokeWeight : 1,
        clickable    : false,
        editable     : false,
        zIndex       : 1
    }
    
    drawingManager = new google.maps.drawing.DrawingManager( {
        drawingMode          : google.maps.drawing.OverlayType.POLYGON,
        drawingControl       : false,
        drawingControlOptions: {
            position    : google.maps.ControlPosition.TOP_CENTER,
            // drawingModes: [ 'marker', 'circle', 'polygon', 'polyline', 'rectangle' ]
            drawingModes: [ 'polygon' ]
        },
        circleOptions        : layerOptions
        , polygonOptions     : layerOptions
        , rectangleOptions   : layerOptions
    } )
    
    google.maps.event.addListener( drawingManager, 'overlaycomplete', function ( e ) {
        polygon = e.overlay
        
        EventBus.dispatch( Events.MAP.POLYGON_DRAWN, null, toGeoJSONString( polygon ), polygon )
        EventBus.dispatch( Events.SECTION.SHOW, null, 'search', { keepAoiLayerVisible: true } )
    } )
    
    // EventBus.dispatch( Events.MAP.ADD_LAYER, null, drawingManager )
    EventBus.dispatch( Events.MAP.ADD_DRAWN_AOI_LAYER, null, drawingManager )
}

var toGeoJSONString = function () {
    var array = []
    polygon.getPath().forEach( function ( a ) {
        array.push( [ a.lng(), a.lat() ] )
    } )
    array.push( array[ 0 ] )
    
    var string = JSON.stringify( array )
    return string
}

var disable = function () {
    if ( drawingManager ) {
        drawingManager.setMap( null )
    }
}

var clear = function () {
    if ( polygon ) {
        // polygon.setMap( null )
        EventBus.dispatch( Events.MAP.REMOVE_DRAWN_AOI_LAYER, null, polygon )
    }
}

EventBus.addEventListener( Events.MAP.POLYGON_DRAW, enable )
EventBus.addEventListener( Events.MAP.POLYGON_CLEAR, clear )

EventBus.addEventListener( Events.SECTION.SHOW, disable )