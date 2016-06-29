/**
 * @author Mino Togna
 */
var sensors           = []
var selectedSensors   = []
var sortWeight        = 0.5
var offsetToTargetDay = 1

var getSensors = function () {
    return sensors
}

var getSelectedSensors = function () {
    return selectedSensors
}

var getSortWeight = function () {
    return sortWeight
}

var getOffsetToTargetDay = function () {
    return offsetToTargetDay
}

var setSensors = function ( value ) {
    sensors = value
}

var setSelectedSensors = function ( value ) {
    selectedSensors = value
}

var setSortWeight = function ( value ) {
    sortWeight = value
}

var setOffsetToTargetDay = function ( value ) {
    offsetToTargetDay = value
}

var reset = function () {
    sensors           = []
    sortWeight        = 0.5
    offsetToTargetDay = 1
}

var removeSelectedSensor = function ( sensor ) {
    if ( selectedSensors.indexOf( sensor ) >= 0 ) {
        selectedSensors.splice( selectedSensors.indexOf( sensor ), 1 )
    }
}

var addSelectedSensor = function ( sensor ) {
    if ( selectedSensors.indexOf( sensor ) < 0 ) {
        selectedSensors.push( sensor )
    }
}

module.exports = {
    getSensors            : getSensors
    , getSelectedSensors  : getSelectedSensors
    , getSortWeight       : getSortWeight
    , getOffsetToTargetDay: getOffsetToTargetDay
    , setSensors          : setSensors
    , setSelectedSensors  : setSelectedSensors
    , setSortWeight       : setSortWeight
    , setOffsetToTargetDay: setOffsetToTargetDay
    , reset               : reset
    , removeSelectedSensor: removeSelectedSensor
    , addSelectedSensor   : addSelectedSensor
}