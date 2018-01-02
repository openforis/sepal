/**
 * @author Mino Togna
 */
var R       = require('ramda')
var Sensors = require('../search/model/sensors')

var SensorsMapping = [
  {sensorId: 'LC8', sensorGroup: 'LANDSAT_8'},
  {sensorId: 'LE7', sensorGroup: 'LANDSAT_7'},
  {sensorId: 'LT5', sensorGroup: 'LANDSAT_TM'},
  {sensorId: 'LT4', sensorGroup: 'LANDSAT_TM'}
]

var state            = {}
var sceneAreaId      = null
var sceneAreaImages  = []
var availableSensors = []

var getSceneImageId = function (image) {
  return image.sceneId
}

var getSceneAreaId = function () {
  return sceneAreaId
}

var setSceneAreaId = function (id) {
  sceneAreaId = id
}

var setState = function (s) {
  state = s
}

var isSceneSelected = function (scene) {
  var sceneId        = getSceneImageId(scene)
  var selectedScenes = state.sceneAreas[sceneAreaId].selection
  var selected       = selectedScenes && selectedScenes.indexOf(sceneId) >= 0
  return selected
}

var setSceneAreaImages = function (images) {
  sceneAreaImages  = images
  availableSensors = []
  
  $.each(images, function (i, image) {
    if (availableSensors.indexOf(image.sensor) < 0) {
      availableSensors.push(image.sensor)
    }
  })
}

var getSortedSceneAreaImages = function () {
  var ccWeight = 1 - state.sortWeight
  var tdWeight = state.sortWeight
  
  var images = sceneAreaImages.slice()
  images     = images.sort(function (a, b) {
    var weightA = a.cloudCover * ccWeight + a.daysFromTargetDay * tdWeight
    var weightB = b.cloudCover * ccWeight + b.daysFromTargetDay * tdWeight
    return weightA - weightB
  })
  
  return images
}

var getAvailableSensors = function () {
  return availableSensors
}

var select = function (image) {
  var sceneId        = getSceneImageId(image)
  var selectedScenes = state.sceneAreas[sceneAreaId].selection
  selectedScenes.push(sceneId)
}

var deselect = function (image) {
  var sceneId        = getSceneImageId(image)
  var selectedScenes = state.sceneAreas[sceneAreaId].selection
  selectedScenes.splice(selectedScenes.indexOf(sceneId), 1)
}

var resetSelection = function () {
  if (state.sceneAreas && state.sceneAreas[sceneAreaId])
    state.sceneAreas[sceneAreaId].selection = []
}

var getUniqueImageSelectionBands = function () {
  var bands = R.pipe(
    R.prop('sceneAreas'),
    R.mapObjIndexed(function (sceneArea, sceneAreaId) {
      return sceneArea.selection
    }),
    R.values,
    R.flatten,
    R.map(function (sceneId) {
      return sceneId.substring(0, 3)
    }),
    R.uniq,
    R.map(function (prefix) {
      return R.pipe(
        R.find(R.propEq('sensorId', prefix)),
        R.defaultTo({sensorGroup: 'SENTINEL2A'}),
        R.prop('sensorGroup')
      )(SensorsMapping)
    }),
    R.map(function (sensorGroup) {
      var sensorObj = (Sensors.LANDSAT[sensorGroup]) ? Sensors.LANDSAT[sensorGroup] : Sensors.SENTINEL2[sensorGroup]
      return sensorObj.bands
    }),
    R.values,
    function (arg) {
      return R.reduce(function(intersection, array){
        return R.intersection(intersection, array)
      }, arg[0])(arg)
    }
  )(state)
  
  return bands ? bands : []
}

module.exports = {
  setState                    : setState
  , getSceneAreaId            : getSceneAreaId
  , setSceneAreaId            : setSceneAreaId
  , isSceneSelected           : isSceneSelected
  , setSceneAreaImages        : setSceneAreaImages
  , getSortedSceneAreaImages  : getSortedSceneAreaImages
  , getAvailableSensors       : getAvailableSensors
  , select                    : select
  , deselect                  : deselect
  , resetSelection            : resetSelection,
  getUniqueImageSelectionBands: getUniqueImageSelectionBands
}
