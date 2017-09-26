/**
 * @author Mino Togna
 */
var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')

var Sensors = require('./sensors')

var mosaicsList = []
var active      = {}

var TYPES = {
  MOSAIC            : 'MOSAIC'
  , CLASSIFICATION  : 'CLASSIFICATION'
  , CHANGE_DETECTION: 'CHANGE-DETECTION'
}

// var getAll = function () {
//   return all
// }

var getActive = function () {
  return active
}

var isActive = function (id) {
  return active ? id === active.id : false
}

var activeModelChange = function (e, obj, params) {
  active = obj
  if (!active) {
    // if (!active || (params && params.isNew)) {
    EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
    EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
  }
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, null, active, params)
}

var mosaicsListChange = function (e, list) {
  mosaicsList = list
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.LIST_CHANGED, null, mosaicsList)
}

var containsMosaicName = function (m) {
  var contains = false
  $.each(mosaicsList, function (i, mosaic) {
    if (mosaic.name === m.name && mosaic.id !== m.id) {
      contains = true
      return false
    }
  })
  return contains
}

module.exports = {
  
  // getAll     : getAll
  getActive           : getActive
  , isActive          : isActive
  , containsMosaicName: containsMosaicName
  
  , getSensorGroups: function () {
    return Object.keys(Sensors)
  }
  , getSensors     : function (sensorGroup) {
    return Sensors[sensorGroup]
  }
  
  , TYPES: TYPES
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, activeModelChange)
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.LIST_CHANGE, mosaicsListChange)
