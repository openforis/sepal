/**
 * @author Mino Togna
 */

var EventBus   = require( '../event/event-bus' )
var Events     = require( '../event/events' )
var Loader     = require( '../loader/loader' )
//
var Model      = require( './scenes-selection-m' )
var View       = require( './scenes-selection-v' )
var SearchForm = require( './../search/search-form' )
var Filter     = require( './scenes-selection-filter-m' )
var FilterView = require( './scenes-selection-filter-v' )

var show = function ( e, type ) {
    if ( type == 'scene-images-selection' ) {
        View.init()
    }
}

var reset = function ( e ) {
    Model.reset()
    Filter.reset()
}

var update = function ( e, sceneAreaId, sceneImages ) {
    Model.setSceneArea( sceneAreaId, sceneImages )
    
    Filter.setAvailableSensors( Model.getSceneAreaSensors().slice(0) )
    // TODO : move out: users might have deselect all sensors and filter will be reset on a new scene area point click
    if( Filter.getSelectedSensors().length ==0 ){
        //it means reset was called. i.e. a new search has been performed
        Filter.setSelectedSensors( Filter.getAvailableSensors().slice(0) )
    }

    FilterView.setSensors( Filter.getAvailableSensors(), Filter.getSelectedSensors() )
    FilterView.setOffsetToTargetDay( Filter.getOffsetToTargetDay() )

    FilterView.showButtons()

    updateView()
}

var updateView = function () {
    View.reset()
    
    $.each( Model.getSceneAreaImages( Filter.getSortWeight() ), function ( i, sceneImage ) {
        setTimeout( function () {
            var filterHidden = Filter.getSelectedSensors().indexOf(sceneImage.sensor) < 0
            View.add( sceneImage , filterHidden )
        }, i * 100 )
    } )

    $.each( Model.getSceneAreaSelectedImages( Model.getSceneAreaId() ), function ( id, sceneImage ) {
        View.select( sceneImage )
    } )

}

var selectImage = function ( e, sceneImage ) {
    Model.select( sceneImage )
    View.select( sceneImage )
    
    EventBus.dispatch( Events.MODEL.SCENE_AREA.CHANGE, null, Model.getSceneAreaId() )
}

var deselectImage = function ( e, sceneImage ) {
    Model.deselect( sceneImage )
    View.deselect( sceneImage )
    
    EventBus.dispatch( Events.MODEL.SCENE_AREA.CHANGE, null, Model.getSceneAreaId() )
}

var loadSceneImages = function ( e, sceneAreaId ) {
    var DATE_FORMAT = "YYYY-MM-DD"
    var targetDay   = SearchForm.targetDate().asMoment()
    
    var data = {
        startDate  : targetDay.clone().subtract( Filter.getOffsetToTargetDay() / 2, 'years' ).format( DATE_FORMAT )
        , endDate  : targetDay.clone().add( Filter.getOffsetToTargetDay() / 2, 'years' ).format( DATE_FORMAT )
        , targetDay: targetDay.format( "MM-DD" )
    }
    
    var params = {
        url         : '/api/data/sceneareas/' + sceneAreaId
        , data      : data
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            
            EventBus.dispatch( Events.SECTION.SHOW, null, 'scene-images-selection' )
            EventBus.dispatch( Events.SECTION.SCENES_SELECTION.UPDATE, null, sceneAreaId, response )
            
            Loader.hide( { delay: 500 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

// Events listeners for filter / sort changes
var updateSortWeight = function ( evt, sortWeight ) {
    Filter.setSortWeight( sortWeight )
    // console.log( Filter.getSortWeight() )
    updateView()
}

var filterHideSensor = function ( e, sensor ) {
    Filter.removeSelectedSensor( sensor )
    View.hideScenesBySensor( sensor )
    FilterView.updateSelectedSensors( Filter.getAvailableSensors(), Filter.getSelectedSensors() )
}

var filterShowSensor = function ( e, sensor ) {
    Filter.addSelectedSensor( sensor )
    View.showScenesBySensor( sensor )
    FilterView.updateSelectedSensors( Filter.getAvailableSensors(), Filter.getSelectedSensors() )
}

var filterTargetDayChange = function ( e, value ) {
    if ( !( Filter.getOffsetToTargetDay() == 1 && value < 0 ) ) {
        Filter.setOffsetToTargetDay( Filter.getOffsetToTargetDay() + value )
        // console.log( Filter.getOffsetToTargetDay() )
        loadSceneImages( null, Model.getSceneAreaId() )
    }
}

EventBus.addEventListener( Events.MAP.SCENE_AREA_CLICK, loadSceneImages )

EventBus.addEventListener( Events.SECTION.SHOW, show )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.RESET, reset )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.UPDATE, update )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.SELECT, selectImage )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.DESELECT, deselectImage )

EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.SORT_CHANGE, updateSortWeight )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_HIDE_SENSOR, filterHideSensor )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_SHOW_SENSOR, filterShowSensor )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, filterTargetDayChange )
