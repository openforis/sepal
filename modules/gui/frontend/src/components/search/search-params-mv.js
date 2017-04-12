/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var SearchParams = require( './search-params' )

// sorting weight change
var weightChange          = function ( e, value ) {
    SearchParams.sortWeight = value
    
    EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.WEIGHT_CHANGED )
}
// offset to target day change
var offsetTargetDayChange = function ( e, value ) {
    if ( !( SearchParams.offsetToTargetDay == 0 && value < 0 ) ) {
        SearchParams.offsetToTargetDay += value
        
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGED, e.target )
    }
    
}

// sensors selection
var selectSensorGroup = function ( sensorGroup ) {
    SearchParams.sensorGroup = sensorGroup
    EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.SENSOR_GROUP_CHANGED, null, sensorGroup )
}

var selectSensor   = function ( sensors, sensorId ) {
    if ( sensors.indexOf( sensorId ) < 0 ) {
        sensors.push( sensorId )
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.SENSORS_CHANGED, null, 'select', sensorId )
    }
}
var deselectSensor = function ( sensors, sensorId ) {
    if ( sensors.indexOf( sensorId ) >= 0 ) {
        sensors.splice( sensors.indexOf( sensorId ), 1 )
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.SENSORS_CHANGED, null, 'deselect', sensorId )
    }
}

var selectLandsatSensor = function ( e, sensorId ) {
    selectSensor( SearchParams.landsatSensors, sensorId )
}

var deselectLandsatSensor = function ( e, sensorId ) {
    deselectSensor( SearchParams.landsatSensors, sensorId )
}

var selectSentinel2Sensor = function ( e, sensorId ) {
    selectSensor( SearchParams.sentinel2Sensors, sensorId )
}

var deselectSentinel2Sensor = function ( e, sensorId ) {
    deselectSensor( SearchParams.sentinel2Sensors, sensorId )
}

// min / max no of scenes change
var minScenesChange = function ( e, value ) {
    SearchParams.minScenes = $.isEmptyString( value ) ? '' : parseInt( value )
    EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.MIN_SCENES_CHANGED )
}

var maxScenesChange = function ( e, value ) {
    SearchParams.maxScenes = $.isEmptyString( value ) ? '' : parseInt( value )
    EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.MAX_SCENES_CHANGED )
}

EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.WEIGHT_CHANGE, weightChange )

EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGE, offsetTargetDayChange )

EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_LANDSAT_SENSOR_GROUP, function ( e ) {
    selectSensorGroup( SearchParams.SENSORS.LANDSAT )
} )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_SENTINEL2_SENSOR_GROUP, function ( e ) {
    selectSensorGroup( SearchParams.SENSORS.SENTINEL2 )
} )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_LANDSAT_SENSOR, selectLandsatSensor )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.DESELECT_LANDSAT_SENSOR, deselectLandsatSensor )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_SENTINEL2_SENSOR, selectSentinel2Sensor )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.DESELECT_SENTINEL2_SENSOR, deselectSentinel2Sensor )

EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.MIN_SCENES_CHANGE, minScenesChange )
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.MAX_SCENES_CHANGE, maxScenesChange )
