/**
 * @author Mino Togna
 */
var GoogleMapsLoader = require( 'google-maps' )
var EventBus         = require( '../event/event-bus' )
var Events           = require( '../event/events' )
var View             = require( './scene-areas-v' )
var ActiveView       = View.newInstance()
var SModel           = require( '../search/model/search-model' )

var state   = {}
var visible = false

var stateChanged = function ( e, s, params ) {
    state = s
    if ( state.type === SModel.TYPES.MOSAIC ) {
        if ( state.sceneAreas ) {
            visible = true
            if ( params && params.resetSceneAreas === true ) {
                var polygons = areasToMapPolygons( state.sceneAreas, state.sensorGroup )
                ActiveView.add( polygons, true )
            }
            
            updateCount()
        }
    } else {
        hideActive()
    }
}

var hideActive = function () {
    if ( ActiveView ) {
        ActiveView.hide()
        visible = false
    }
}

var areasToMapPolygons = function ( scenes, dataSet ) {
    var array = new Array()
    
    GoogleMapsLoader.load( function ( google ) {
        $.each( Object.keys( scenes ), function ( i, key ) {
            var scene        = scenes[ key ]
            var bounds       = new google.maps.LatLngBounds()
            var polygonPaths = new Array()
            var polygon      = scene.polygon
            for ( var j = 0; j < polygon.length; j++ ) {
                var latLong  = polygon[ j ]
                var gLatLong = new google.maps.LatLng( Number( latLong[ 0 ] ), Number( latLong[ 1 ] ) )
                bounds.extend( gLatLong )
                
                polygonPaths.push( gLatLong )
            }
            
            var gPolygon = new google.maps.Polygon( {
                paths        : polygonPaths,
                strokeColor  : '#C5B397',
                // strokeOpacity: 0.4,
                strokeOpacity: 1,
                strokeWeight : 2,
                fillColor    : '#C5B397',
                fillOpacity  : 0.8
            } )
            
            var item               = {}
            item.center            = bounds.getCenter()
            item.scene             = scene
            item.scene.sceneAreaId = key
            item.polygon           = gPolygon
            item.dataSet           = dataSet
            array.push( item )
        } )
    } )
    
    return array
}

var updateCount = function () {
    if ( ActiveView.layer && ActiveView.layer.ready ) {
        $.each( Object.keys( state.sceneAreas ), function ( i, key ) {
            var scene = state.sceneAreas[ key ]
            var cnt   = scene.selection.length
            ActiveView.setCount( key, cnt )
        } )
    } else {
        setTimeout( updateCount, 500 )
    }
}

//application visibility events
var onApplicationSectionShow = function ( e ) {
    if ( visible )
        ActiveView.hide()
}

var onApplicationSectionReduce = function ( e ) {
    if ( visible )
        ActiveView.show()
}
// visibility events
var showArea                   = function () {
    ActiveView.show()
    visible = true
}
var hideArea                   = function () {
    ActiveView.hide()
    visible = false
}

var resetSceneAreas = function ( e ) {
    ActiveView.reset()
}

var onMapZoomChanged = function ( e, zoomLevel ) {
    ActiveView.setZoomLevel( zoomLevel )
}

EventBus.addEventListener( Events.SECTION.SEARCH.MODEL.ACTIVE_CHANGED, stateChanged )

//application visibility events
EventBus.addEventListener( Events.SECTION.SHOW, onApplicationSectionShow )
EventBus.addEventListener( Events.SECTION.REDUCE, onApplicationSectionReduce )

// visibility events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.SHOW_SCENE_AREAS, showArea )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.HIDE_SCENE_AREAS, hideArea )

// map zoom change
EventBus.addEventListener( Events.MAP.ZOOM_CHANGED, onMapZoomChanged )