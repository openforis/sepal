/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './scene-area-mosaics-v' )

var reset = function () {
    View.reset()
}

var addMosaic = function ( e, mapId, token ) {
    View.addMosaic( mapId, token )
}
// var addLandsatMosaic = function ( e, mapId, token ) {
//     View.addLandsatMosaic( mapId, token )
// }
//
// var addSentinel2Mosaic = function ( e, mapId, token ) {
//     View.addSentinel2Mosaic( mapId, token )
// }

var toggleMosaicVisibility = function ( e ) {
    View.toggleMosaicVisibility()
}
// var toggleLandsatMosaic = function ( e ) {
//     View.toggleLandsatMosaic()
// }
//
// var toggleSentinel2Mosaic = function ( e ) {
//     View.toggleSentinel2Mosaic()
// }

var hideMosaic = function () {
    View.hideMosaic()
}

var showMosaic = function () {
    View.showMosaic()
}

EventBus.addEventListener( Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, reset )
// EventBus.addEventListener( Events.SCENE_AREAS.RESET, reset )

// add mosaic events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.MOSAIC_LOADED, addMosaic )
// EventBus.addEventListener( Events.SCENE_AREA_MOSAICS.LANDSAT.ADD, addLandsatMosaic )
// EventBus.addEventListener( Events.SCENE_AREA_MOSAICS.SENTINEL2.ADD, addSentinel2Mosaic )

//toggle visibility events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.TOGGLE_MOSAIC_VISIBILITY, toggleMosaicVisibility )
// EventBus.addEventListener( Events.SCENE_AREA_MOSAICS.LANDSAT.TOGGLE_VISIBILITY, toggleLandsatMosaic )
// EventBus.addEventListener( Events.SCENE_AREA_MOSAICS.SENTINEL2.TOGGLE_VISIBILITY, toggleSentinel2Mosaic )
EventBus.addEventListener( Events.SECTION.SHOW, hideMosaic )
EventBus.addEventListener( Events.SECTION.REDUCE, showMosaic )