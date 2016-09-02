/**
 * @author Mino Togna
 */

/// DEPRECATED

var availableSensors  = null
var selectedSensors   = null
var sortWeight        = 0.5
var offsetToTargetDay = 1

var getAvailableSensors = function () {
    return availableSensors
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

var setAvailableSensors = function ( value ) {
    availableSensors = value
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
    availableSensors  = null
    selectedSensors   = null
    sortWeight        = 0.5
    offsetToTargetDay = 1
}

var selectSensor = function ( sensor ) {
    if ( selectedSensors.indexOf( sensor ) >= 0 ) {
        selectedSensors.splice( selectedSensors.indexOf( sensor ), 1 )
    }
}

var deselectSensor = function ( sensor ) {
    if ( selectedSensors.indexOf( sensor ) < 0 ) {
        selectedSensors.push( sensor )
    }
}

var isSensorSelected = function ( sensor ) {
    var sensors = getSelectedSensors()
    return sensors && sensors.indexOf( sensor ) < 0
}

module.exports = {
    getAvailableSensors   : getAvailableSensors
    , getSelectedSensors  : getSelectedSensors
    , getSortWeight       : getSortWeight
    , getOffsetToTargetDay: getOffsetToTargetDay
    , setAvailableSensors : setAvailableSensors
    , setSelectedSensors  : setSelectedSensors
    , setSortWeight       : setSortWeight
    , setOffsetToTargetDay: setOffsetToTargetDay
    , reset               : reset
    , selectSensor        : selectSensor
    , deselectSensor      : deselectSensor
    , isSensorSelected    : isSensorSelected
}