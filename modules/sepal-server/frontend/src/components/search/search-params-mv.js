/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var SearchParams = require( './search-params' )

var weightChange = function ( e, value ) {
    SearchParams.sortWeight = value
    
    EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.WEIGHT_CHANGED )
}

var offsetTargetDayChange = function ( e, value  ) {
    if ( !( SearchParams.offsetToTargetDay == 0 && value < 0 ) ) {
        SearchParams.offsetToTargetDay += value
        
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGED , e.target  )
    }
    
}

var selectSensor = function ( e, sensorId ) {
    if ( SearchParams.sensors.indexOf( sensorId ) < 0 ) {
        SearchParams.sensors.push( sensorId )
        
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.SENSORS_CHANGED, null, 'select', sensorId )
    }
}

var deselectSensor = function ( e, sensorId ) {
    if ( SearchParams.sensors.indexOf( sensorId ) >= 0 ) {
        SearchParams.sensors.splice( SearchParams.sensors.indexOf( sensorId ), 1 )
        
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.SENSORS_CHANGED, null, 'deselect', sensorId )
    }
}


EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.WEIGHT_CHANGE, weightChange )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGE, offsetTargetDayChange )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_SENSOR, selectSensor )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.DESELECT_SENSOR, deselectSensor )
