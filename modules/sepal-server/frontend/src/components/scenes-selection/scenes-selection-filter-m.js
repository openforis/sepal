/**
 * @author Mino Togna
 */
var availableSensors  = []
var selectedSensors   = []
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
    availableSensors  = []
    selectedSensors   = []
    sortWeight        = 0.5
    offsetToTargetDay = 1
}

var removeSelectedSensor = function ( sensor ) {
    if ( selectedSensors.indexOf( sensor ) >= 0 ) {
        selectedSensors.splice( selectedSensors.indexOf( sensor ), 1 )
        console.log(selectedSensors)
    }
}

var addSelectedSensor = function ( sensor ) {
    if ( selectedSensors.indexOf( sensor ) < 0 ) {
        selectedSensors.push( sensor )
    }
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
    , removeSelectedSensor: removeSelectedSensor
    , addSelectedSensor   : addSelectedSensor
}