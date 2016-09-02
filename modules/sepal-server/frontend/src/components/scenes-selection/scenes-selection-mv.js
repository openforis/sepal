/**
 * @author Mino Togna
 */

var EventBus     = require( '../event/event-bus' )
var Events       = require( '../event/events' )
var Loader       = require( '../loader/loader' )
//
var Model        = require( './scenes-selection-m' )
var View         = require( './scenes-selection-v' )
var SearchParams = require( './../search/search-params' )

var viewInitialized = false
var show = function ( e, type ) {
    if ( type == 'scene-images-selection' ) {
        View.init()
        viewInitialized = true
    }
}

var loadSceneImages = function ( e, sceneAreaId, showAppSection ) {
    
    var data = {}
    SearchParams.addDatesRequestParameters( data )
    
    var params = {
        url         : '/api/data/sceneareas/' + sceneAreaId
        , data      : data
        , beforeSend: function () {
            if ( showAppSection !== false ) {
                Loader.show()
            }
        }
        , success   : function ( response ) {
            if ( showAppSection !== false ) {
                EventBus.dispatch( Events.SECTION.SHOW, null, 'scene-images-selection' )
            }
            
            Model.setSceneArea( sceneAreaId, response )
            updateView()
            
            if ( showAppSection !== false ) {
                Loader.hide( { delay: 500 } )
            }
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var reset = function ( e ) {
    Model.reset()
    if( viewInitialized )
        View.reset()
}

var interval       = null
var stopUpdateView = function () {
    clearInterval( interval )
    interval = null
}
var updateView     = function () {
    if ( Model.getSceneAreaId() ) {
        
        if ( interval ) {
            stopUpdateView()
            updateView()
        } else {
            var idx             = 0
            var sceneAreaImages = Model.getSceneAreaImages( SearchParams.sortWeight )
            
            var addScene = function () {
                var sceneImage   = sceneAreaImages[ idx ]
                var filterHidden = SearchParams.isSensorSelected( sceneImage.sensor )
                var selected     = Model.isSceneSelected( sceneImage )
                
                View.add( sceneImage, filterHidden, selected )
                idx++
                
                if ( idx === sceneAreaImages.length ) {
                    stopUpdateView()
                }
            }
            
            View.reset( Model.getSceneAreaId(), Model.getSceneAreaSensors().slice( 0 ) )
            if ( sceneAreaImages.length > 0 ) {
                interval = setInterval( addScene, 75 )
            }
        }
        
    }
}

var selectImage = function ( e, sceneAreaId, sceneImage ) {
    Model.select( sceneAreaId, sceneImage )
    View.select( sceneAreaId, sceneImage )
    
    EventBus.dispatch( Events.MODEL.SCENE_AREA.CHANGE, null, sceneAreaId )
}

var deselectImage = function ( e, sceneAreaId, sceneImage ) {
    Model.deselect( sceneAreaId, sceneImage )
    View.deselect( sceneAreaId, sceneImage )
    
    EventBus.dispatch( Events.MODEL.SCENE_AREA.CHANGE, null, sceneAreaId )
}


// Events listeners for filter / sort changes
// var updateSortWeight = function ( evt, sortWeight ) {
//     Filter.setSortWeight( sortWeight )
//     // console.log( Filter.getSortWeight() )
//     updateView()
// }

// var filterHideSensor = function ( e, sensor ) {
//     if ( FilterView.isInitialzied() )
//         View.hideScenesBySensor( sensor )
// }
//
// var filterShowSensor = function ( e, sensor ) {
//     if ( FilterView.isInitialzied() )
//         View.showScenesBySensor( sensor )
// }

// var reloadScenes = function ( e ) {
//     loadSceneImages( null, Model.getSceneAreaId(), false )
// }
// }// var filterTargetDayChange = function ( e, value ) {
//     if ( !( Filter.getOffsetToTargetDay() == 1 && value < 0 ) ) {
//         Filter.setOffsetToTargetDay( Filter.getOffsetToTargetDay() + value )
//         // console.log( Filter.getOffsetToTargetDay() )
//         loadSceneImages( null, Model.getSceneAreaId() )
//     }
// }

var onWeightChanged = function () {
    if ( viewInitialized ) {
        View.setSortWeight( SearchParams.sortWeight )
        updateView()
    }
}

var onOffsetTargetDayChanged = function () {
    if ( viewInitialized ) {
        View.setOffsetToTargetDay( SearchParams.offsetToTargetDay )
        loadSceneImages( null, Model.getSceneAreaId(), false )
    }
}

var onSensorsChanged = function ( e, action, sensorId ) {
    if ( viewInitialized ) {
        View.setSensors( Model.getSceneAreaSensors().slice( 0 ), SearchParams.sensors )
        if ( action === 'select' ) {
            View.showScenesBySensor( sensorId )
        } else if ( action === 'deselect' ) {
            View.hideScenesBySensor( sensorId )
        }
        // updateView()
    }
}

EventBus.addEventListener( Events.MAP.SCENE_AREA_CLICK, loadSceneImages )

EventBus.addEventListener( Events.SECTION.SHOW, show )

EventBus.addEventListener( Events.SECTION.SEARCH.SCENE_AREAS_LOADED, reset )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.RESET, reset )

// EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.UPDATE_VIEW, updateView )

EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.SELECT, selectImage )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.DESELECT, deselectImage )


// search params changed events
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.WEIGHT_CHANGED, onWeightChanged )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGED, onOffsetTargetDayChanged )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.SENSORS_CHANGED, onSensorsChanged )

//TODO search params changed events
// EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.SORT_CHANGE, updateSortWeight )
// EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_HIDE_SENSOR, filterHideSensor )
// EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_SHOW_SENSOR, filterShowSensor )
// EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.RELOAD_SCENES, reloadScenes )
