/**
 * @author Mino Togna
 */

var EventBus     = require( '../event/event-bus' )
var Events       = require( '../event/events' )
var Loader       = require( '../loader/loader' )
//
var Model        = require( './scenes-selection-m' )
var View         = require( './scenes-selection-v' )
var SearchForm   = require( './../search/views/search-form' )
var SearchParams = require( './../search/search-params' )
var Filter       = require( './../scenes-selection-filter/scenes-selection-filter-m' )
var FilterView   = require( './../scenes-selection-filter/scenes-selection-filter-v' )

var show = function ( e, type ) {
    if ( type == 'scene-images-selection' ) {
        View.init()
    }
}

var reset = function ( e ) {
    Model.reset()
    View.reset()
    // Filter.reset()
    
}

var update = function ( sceneAreaId, sceneImages ) {
    Model.setSceneArea( sceneAreaId, sceneImages )
    
    Filter.setAvailableSensors( Model.getSceneAreaSensors().slice( 0 ) )
    if ( !Filter.getSelectedSensors() ) {
        //it means reset was called. i.e. a new search has been performed
        Filter.setSelectedSensors( Filter.getAvailableSensors().slice( 0 ) )
    }
    
    FilterView.setSensors( Filter.getAvailableSensors(), Filter.getSelectedSensors() )
    FilterView.setOffsetToTargetDay( Filter.getOffsetToTargetDay() )
    FilterView.setSortWeight( Filter.getSortWeight() )
    
    FilterView.showButtons()
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
            var sceneAreaImages = Model.getSceneAreaImages( Filter.getSortWeight() )
            
            var addScene = function () {
                var sceneImage   = sceneAreaImages[ idx ]
                var filterHidden = Filter.isSensorSelected( sceneImage.sensor )
                var selected     = Model.isSceneSelected( sceneImage )
                
                View.add( sceneImage, filterHidden, selected )
                idx++
                
                if ( idx === sceneAreaImages.length ) {
                    stopUpdateView()
                }
            }
            
            View.reset( Model.getSceneAreaId() )
            if( sceneAreaImages.length >0 ){
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

var loadSceneImages = function ( e, sceneAreaId, showAppSection ) {
    var DATE_FORMAT = "YYYY-MM-DD"
    var targetDate  = SearchParams.targetDate.asMoment()
    
    var data = {
        fromDate         : targetDate.clone().subtract( Filter.getOffsetToTargetDay() / 2, 'years' ).format( DATE_FORMAT )
        , toDate         : targetDate.clone().add( Filter.getOffsetToTargetDay() / 2, 'years' ).format( DATE_FORMAT )
        , targetDayOfYear: targetDate.format( "DDD" )
    }
    
    var params = {
        url         : '/api/data/sceneareas/' + sceneAreaId
        , data      : data
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            if ( showAppSection !== false ) {
                EventBus.dispatch( Events.SECTION.SHOW, null, 'scene-images-selection' )
            }
            
            update( sceneAreaId, response )
            updateView()
            // EventBus.dispatch( Events.SECTION.SCENES_SELECTION.UPDATE_VIEW )
            
            Loader.hide( { delay: 500 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

// Events listeners for filter / sort changes
// var updateSortWeight = function ( evt, sortWeight ) {
//     Filter.setSortWeight( sortWeight )
//     // console.log( Filter.getSortWeight() )
//     updateView()
// }

var filterHideSensor = function ( e, sensor ) {
    if ( FilterView.isInitialzied() )
        View.hideScenesBySensor( sensor )
}

var filterShowSensor = function ( e, sensor ) {
    if ( FilterView.isInitialzied() )
        View.showScenesBySensor( sensor )
}

var reloadScenes = function ( e ) {
    loadSceneImages( null, Model.getSceneAreaId(), false )
}
// }// var filterTargetDayChange = function ( e, value ) {
//     if ( !( Filter.getOffsetToTargetDay() == 1 && value < 0 ) ) {
//         Filter.setOffsetToTargetDay( Filter.getOffsetToTargetDay() + value )
//         // console.log( Filter.getOffsetToTargetDay() )
//         loadSceneImages( null, Model.getSceneAreaId() )
//     }
// }

EventBus.addEventListener( Events.MAP.SCENE_AREA_CLICK, loadSceneImages )

EventBus.addEventListener( Events.SECTION.SHOW, show )

EventBus.addEventListener( Events.SECTION.SEARCH.SCENE_AREAS_LOADED, reset )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.RESET, reset )

EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.UPDATE_VIEW, updateView )

EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.SELECT, selectImage )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.DESELECT, deselectImage )

// EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.SORT_CHANGE, updateSortWeight )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_HIDE_SENSOR, filterHideSensor )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_SHOW_SENSOR, filterShowSensor )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.RELOAD_SCENES, reloadScenes )
