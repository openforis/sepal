/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
// var Loader   = require( '../loader/loader' )

var Filter           = require( './scenes-selection-filter-m' )
var FilterView       = require( './scenes-selection-filter-v' )
var ScenesFilterView = require( '../search-retrieve/scenes-autoselection-form-v' )
var Sensors          = require( '../sensors/sensors' )

var reset = function () {
    Filter.reset()
    Filter.setSelectedSensors( Object.keys( Sensors ) )
    
    ScenesFilterView.reset()
    ScenesFilterView.setOffsetToTargetDay( Filter.getOffsetToTargetDay() )
    ScenesFilterView.setSelectedSensors( Filter.getSelectedSensors() )
    ScenesFilterView.setSortWeight( Filter.getSortWeight() )
}

var updateSortWeight = function ( evt, sortWeight ) {
    Filter.setSortWeight( sortWeight )
    
    ScenesFilterView.setSortWeight( Filter.getSortWeight() )
    
    if ( FilterView.isInitialzied() ) {
        FilterView.setSortWeight( Filter.getSortWeight() )
        
        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.UPDATE_VIEW )
    }
}

var filterHideSensor = function ( e, sensor ) {
    Filter.selectSensor( sensor )
    
    ScenesFilterView.setSelectedSensors( Filter.getSelectedSensors() )
    
    if ( FilterView.isInitialzied() ) {
        FilterView.setSelectedSensors( Filter.getAvailableSensors(), Filter.getSelectedSensors() )
    }
}

var filterShowSensor = function ( e, sensor ) {
    Filter.deselectSensor( sensor )
    
    ScenesFilterView.setSelectedSensors( Filter.getSelectedSensors() )
    
    if ( FilterView.isInitialzied() ) {
        FilterView.setSelectedSensors( Filter.getAvailableSensors(), Filter.getSelectedSensors() )
    }
}

var filterTargetDayChange = function ( e, value ) {
    if ( !( Filter.getOffsetToTargetDay() == 1 && value < 0 ) ) {
        Filter.setOffsetToTargetDay( Filter.getOffsetToTargetDay() + value )
        ScenesFilterView.setOffsetToTargetDay( Filter.getOffsetToTargetDay() )
        
        if ( FilterView.isInitialzied() ) {
            FilterView.setOffsetToTargetDay( Filter.getOffsetToTargetDay() )
            
            EventBus.dispatch( Events.SECTION.SCENES_SELECTION.RELOAD_SCENES )
        }
    }
}

EventBus.addEventListener( Events.SECTION.SEARCH.SCENE_AREAS_LOADED, reset )

EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.SORT_CHANGE, updateSortWeight )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_HIDE_SENSOR, filterHideSensor )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_SHOW_SENSOR, filterShowSensor )
EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, filterTargetDayChange )
