/**
 * @author Mino Togna
 */

var EventBus = require('../event/event-bus')
var Events   = require('../event/events')
var Loader   = require('../loader/loader')

var Model              = require('./scenes-selection-m')
var View               = require('./scenes-selection-v')
var SModel             = require('./../search/model/search-model')
var SearchRequestUtils = require('./../search/search-request-utils')

var oldOffsetTargetDay = null

var state           = {}
var viewInitialized = false

var show = function (e, type) {
  if (type == 'scene-images-selection') {
    View.init()
    viewInitialized = true
  }
}

var sceneAreaClick = function (e, sceneAreaId, dataSet) {
  Model.setSceneAreaId(sceneAreaId)
  View.setDataSet(state.sensorGroup)
  loadSceneImages(sceneAreaId)
}

var loadSceneImages = function (sceneAreaId, showAppSection) {
  
  var data = {dataSet: state.sensorGroup}
  SearchRequestUtils.addDatesRequestParameters(state, data)
  
  var params = {
    url         : '/api/data/sceneareas/' + sceneAreaId
    , data      : data
    , beforeSend: function () {
      if (showAppSection !== false) {
        Loader.show()
      }
    }
    , success   : function (response) {
      if (showAppSection !== false) {
        EventBus.dispatch(Events.SECTION.SHOW, null, 'scene-images-selection')
      }
      
      Model.setSceneAreaImages(response)
      oldOffsetTargetDay = state.offsetToTargetDay
      updateView()
      
      if (showAppSection !== false) {
        Loader.hide({delay: 500})
      }
    }
  }
  
  EventBus.dispatch(Events.AJAX.REQUEST, null, params)
}

var reset = function (e) {
  // Model.reset()
  if (viewInitialized)
    View.forceReset()
}

var interval       = null
var stopUpdateView = function () {
  clearInterval(interval)
  interval = null
}
var updateView     = function () {
  if (Model.getSceneAreaId()) {
    
    if (interval) {
      stopUpdateView()
      updateView()
    } else {
      var idx             = 0
      var sceneAreaImages = Model.getSortedSceneAreaImages()
      
      var addScene = function () {
        var sceneImage   = sceneAreaImages[idx]
        var filterHidden = state.sensors.indexOf(sceneImage.sensor) < 0
        var selected     = Model.isSceneSelected(sceneImage)
        
        View.add(sceneImage, filterHidden, selected)
        idx++
        
        if (idx === sceneAreaImages.length) {
          stopUpdateView()
          
        }
      }
      View.reset(Model.getSceneAreaId(), Model.getAvailableSensors().slice(0))
      updateState(null, state)
      
      if (sceneAreaImages.length > 0) {
        interval = setInterval(addScene, 75)
      }
    }
    
  }
}

var selectImage = function (e, sceneAreaId, sceneImage) {
  Model.select(sceneImage)
  View.select(sceneAreaId, sceneImage)
  
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {updateSceneAreas: true})
  
}

var deselectImage = function (e, sceneAreaId, sceneImage) {
  Model.deselect(sceneImage)
  View.deselect(sceneAreaId, sceneImage)
  
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {updateSceneAreas: true})
}

var updateState = function (e, s, params) {
  state = s
  Model.setState(state)
  
  if (viewInitialized) {
    if (!state || (params && (params.resetSceneAreas || params.isNew))) {
      View.forceReset()
    }
    
    if (state && state.type === SModel.TYPES.MOSAIC) {
      View.setSortWeight(state.sortWeight)
      View.setOffsetToTargetDay(state.offsetToTargetDay)
      View.updateSensors()
    }
  }
}

var searchParamsChanged = function (e) {
  if (viewInitialized) {
    if (oldOffsetTargetDay != null && state.offsetToTargetDay !== oldOffsetTargetDay) {
      loadSceneImages(Model.getSceneAreaId(), false)
    } else {
      updateView()
    }
    oldOffsetTargetDay = state.offsetToTargetDay
  }
}

EventBus.addEventListener(Events.MAP.SCENE_AREA_CLICK, sceneAreaClick)

EventBus.addEventListener(Events.SECTION.SHOW, show)

EventBus.addEventListener(Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, reset)
EventBus.addEventListener(Events.SECTION.SEARCH_RETRIEVE.BEST_SCENES, reset)

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, updateState)
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED, searchParamsChanged)

EventBus.addEventListener(Events.SECTION.SCENES_SELECTION.SELECT, selectImage)
EventBus.addEventListener(Events.SECTION.SCENES_SELECTION.DESELECT, deselectImage)
