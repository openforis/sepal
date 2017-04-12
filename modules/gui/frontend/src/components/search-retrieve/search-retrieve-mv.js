/**
 * @author Mino Togna
 */

var EventBus            = require( '../event/event-bus' )
var Events              = require( '../event/events' )
var Loader              = require( '../loader/loader' )
var View                = require( './search-retrieve-v' )
// var Model          = require( './search-retrieve-m' )
var SceneSelectionModel = require( '../scenes-selection/scenes-selection-m' )
var SearchParams        = require( '../search/search-params' )

require( './search-retrieve-scenes-mv' )
require( './search-retrieve-mosaic-mv' )

var show     = false
var appShown = true

var init = function () {
    show     = false
    appShown = true
    
    View.init()
    View.hide( { delay: 0, duration: 0 } )
}

var appShow = function ( e, section ) {
    View.hide()
    appShown = true
}

var appReduce = function ( e, section ) {
    appShown = false
    if ( show ) {
        View.show()
    }
}


var initSceneAreas = function ( e ) {
    show = true
    View.reset()
}

var scenesUpdate = function ( e ) {
    var landsatScenesNo  = SceneSelectionModel.getSelectedSceneIds()[ SearchParams.SENSORS.LANDSAT ].length
    var sentinelScenesNo = SceneSelectionModel.getSelectedSceneIds()[ SearchParams.SENSORS.SENTINEL2 ].length
    
    View.setSelectedScenesNumber( landsatScenesNo, sentinelScenesNo )
}

// app events
EventBus.addEventListener( Events.APP.LOAD, init )

// app section events
EventBus.addEventListener( Events.SECTION.SHOW, appShow )
EventBus.addEventListener( Events.SECTION.REDUCE, appReduce )

// view events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW, View.collapse )

//search events
EventBus.addEventListener( Events.SCENE_AREAS.INIT, initSceneAreas )
EventBus.addEventListener( Events.SCENE_AREAS.SCENES_UPDATE, scenesUpdate )

// search params changed events
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.WEIGHT_CHANGED, function () {
    View.setSortWeight( SearchParams.sortWeight )
} )

EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGED, function () {
    View.setOffsetToTargetDay( SearchParams.offsetToTargetDay )
} )

EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.SENSORS_CHANGED, function () {
    View.setSelectedSensors( SearchParams.landsatSensors, SearchParams.sentinel2Sensors )
} )