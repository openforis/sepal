/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './scene-area-mosaics-v' )

var reset = function () {
    View.reset()
}

var addLandsatMosaic = function ( e, mapId, token ) {
    View.addLandsatMosaic( mapId, token )
}

var addSentinel2Mosaic = function ( e, mapId, token ) {
    View.addSentinel2Mosaic( mapId, token )
}

var toggleLandsatMosaic = function ( e ) {
    View.toggleLandsatMosaic()
}

var toggleSentinel2Mosaic = function ( e ) {
    View.toggleSentinel2Mosaic()
}

var hideActiveMosaic = function () {
    View.hideActiveMosaic()
}

var showActiveMosaic = function () {
    View.showActiveMosaic()
}

EventBus.addEventListener( Events.SCENE_AREAS.INIT, reset )
EventBus.addEventListener( Events.SCENE_AREAS.RESET, reset )

// add mosaic events
EventBus.addEventListener( Events.SCENE_AREA_MOSAICS.LANDSAT.ADD, addLandsatMosaic )
EventBus.addEventListener( Events.SCENE_AREA_MOSAICS.SENTINEL2.ADD, addSentinel2Mosaic )

//toggle visibility events
EventBus.addEventListener( Events.SCENE_AREA_MOSAICS.LANDSAT.TOGGLE_VISIBILITY, toggleLandsatMosaic )
EventBus.addEventListener( Events.SCENE_AREA_MOSAICS.SENTINEL2.TOGGLE_VISIBILITY, toggleSentinel2Mosaic )
EventBus.addEventListener( Events.SECTION.SHOW, hideActiveMosaic )
EventBus.addEventListener( Events.SECTION.REDUCE, showActiveMosaic )