/**
 * @author Mino Togna
 */
// var moment   = require( 'moment' )
var EventBus           = require('../event/event-bus')
var Events             = require('../event/events')
var Loader             = require('../loader/loader')
var View               = require('./search-v')
var Model              = require('./model/search-model')
var SearchRequestUtils = require('./search-request-utils')
var moment             = require('moment')
var guid               = require('../guid/guid')

require('../scene-areas/scene-areas-mv')
require('../scenes-selection/scenes-selection-mv')
require('../search-retrieve/search-retrieve-mv')
require('../scene-area-mosaics/scene-area-mosaics-mv')

var show = function (e, type, params) {
  if (type == 'search') {
    View.init()
  }
  if (!(params && params.source === 'app-section'))
    View.showList()
}

var requestSceneAreas = function (e, state) {
  var data     = {}
  data.dataSet = state.sensorGroup
  SearchRequestUtils.addAoiRequestParameter(state, data)
  
  var params = {
    url         : '/api/data/sceneareas'
    , data      : data
    , beforeSend: function () {
      Loader.show()
    }
    , success   : function (response) {
      state.sceneAreas = {}
      $.each(response, function (i, sceneArea) {
        state.sceneAreas[sceneArea.sceneAreaId] = {polygon: sceneArea.polygon, selection: []}
      })
      state.mosaicPreviewBand = null
      state.scenesPreview     = true
      
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {resetSceneAreas: true})
      EventBus.dispatch(Events.SECTION.REDUCE)
      Loader.hide({delay: 300})
    }
  }
  EventBus.dispatch(Events.AJAX.POST, null, params)
  
}

EventBus.addEventListener(Events.SECTION.SHOW, show)
EventBus.addEventListener(Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, requestSceneAreas)

// list actions
var loadList = function (e) {
  var params = {
    url    : '/processing-recipes',
    success: function (response) {
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.LIST_CHANGE, null, response)
    }
  }
  EventBus.dispatch(Events.AJAX.GET, null, params)
}

var _loadMosaic = function (id, callback) {
  var params = {
    url         : '/processing-recipes/' + id
    , beforeSend: function () {
      Loader.show()
    }
    , success   : function (response) {
      Loader.hide({delay: 1000})
      
      var state = typeof response === 'string' ? JSON.parse(response) : response
      delete state['mosaic']
      
      setTimeout(function () {
        switch (state.type) {
          case Model.TYPES.MOSAIC:
            View.showMosaic()
            break
          case Model.TYPES.CLASSIFICATION:
            View.showClassification()
            break
          case Model.TYPES.CHANGE_DETECTION:
            View.showChangeDetection()
            break
        }
      }, 200)
      setTimeout(function () {
        callback(state)
      }, 600)
    }
  }
  EventBus.dispatch(Events.AJAX.GET, null, params)
}

var loadMosaic = function (e, id) {
  _loadMosaic(id, function (state) {
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {resetSceneAreas: true, isNew: true})
    EventBus.dispatch(Events.SECTION.REDUCE)
    if (state.mosaicPreview) {
      switch (state.type) {
        
        case Model.TYPES.MOSAIC:
          if (state.mosaicPreviewBand)
            EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.PREVIEW_MOSAIC, null, state)
          break
        case Model.TYPES.CLASSIFICATION:
          requestClassification(e, state)
          break
        case Model.TYPES.CHANGE_DETECTION:
          requestChangeDetection(e, state)
          break
        
      }
    }
  })
}

var cloneMosaic = function (e, id) {
  _loadMosaic(id, function (state) {
    state.id   = guid.random()
    state.name = state.name + '-clone'
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {
      resetSceneAreas: true,
      hideSceneAreas : true,
      isNew          : true
    })
  })
}

var deleteMosaic = function (e, id) {
  var params = {
    url         : '/processing-recipes/' + id
    , beforeSend: function () {
      Loader.show()
    }
    , success   : function (response) {
      Loader.hide({delay: 1000})
      
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.LIST_CHANGE, null, response)
      
      if (Model.isActive(id)) {
        EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, null)
      }
    }
  }
  EventBus.dispatch(Events.AJAX.DELETE, null, params)
}

var showList = function () {
  View.showList()
}

// add mosaics
var addMosaic = function () {
  
  var getDefaultState = function () {
    var date         = moment(new Date())
    var sensors      = Model.getSensors(Model.getSensorGroups()[0])
    var defaultState = {
      id         : guid.random(),
      type       : Model.TYPES.MOSAIC,
      name       : 'mosaic-' + date.format('YYYY-MM-DD-HHmm'),
      aoiCode    : null,
      aoiName    : null,
      sensorGroup: Model.getSensorGroups()[0],
      targetDate : date.format('YYYY-MM-DD'),
      
      sortWeight           : 0.5,
      sensors              : Object.keys(sensors).filter(function (sensor) {
        return sensors[sensor].selected
      }),
      offsetToTargetDay    : 0,
      minScenes            : 1,
      maxScenes            : null,
      maskClouds           : false,
      maskSnow             : true,
      brdfCorrect          : true,
      median               : false,
      mosaicTargetDayWeight: 0,
      mosaicShadowTolerance: 1,
      mosaicHazeTolerance  : 0.05,
      mosaicGreennessWeight: 0
    }
    return defaultState
  }
  // View.showMosaic()
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, getDefaultState(), {isNew: true})
}

//classification
var addClassification = function () {
  
  var getDefaultState = function () {
    var date         = moment(new Date())
    var defaultState = {
      id                    : guid.random(),
      type                  : Model.TYPES.CLASSIFICATION,
      name                  : 'classification-' + date.format('YYYY-MM-DD-HHmm'),
      inputRecipe           : null,
      fusionTableId         : null,
      fusionTableClassColumn: null,
      algorithm             : 'cart'
    }
    return defaultState
  }
  // View.showMosaic()
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, getDefaultState(), {isNew: true})
}

var classificationRequestData = function (state) {
  return {
    imageType    : Model.TYPES.CLASSIFICATION,
    imageRecipeId: state.inputRecipe,
    assetId      : state.geeAssetId,
    tableName    : state.fusionTableId,
    classProperty: state.fusionTableClassColumn,
    algorithm    : state.algorithm
  }
}

var requestClassification = function (e, state) {
  var data   = classificationRequestData(state)
  var params = {
    url         : '/api/data/classification/preview',
    data        : data
    , beforeSend: function () {
      Loader.show()
    }
    , success   : function (response) {
      state.mosaicPreview = true
      state.mosaic        = {mapId: response.mapId, token: response.token}
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.MOSAIC_LOADED, null, state.mosaic.mapId, state.mosaic.token)
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
      
      EventBus.dispatch(Events.SECTION.REDUCE)
      
      Loader.hide({delay: 500})
    }
  }
  EventBus.dispatch(Events.AJAX.POST, null, params)
}

var retrieveClassification = function (e, state, obj) {
  var data         = classificationRequestData(state)
  data.name        = obj.name
  data.destination = obj.destination
  
  var params = {
    url         : '/api/data/classification/retrieve'
    , data      : data
    , beforeSend: function () {
      setTimeout(function () {
        EventBus.dispatch(Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager')
      }, 100)
      
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW)
    }
    , success   : function (e) {
      EventBus.dispatch(Events.SECTION.TASK_MANAGER.CHECK_STATUS)
    }
  }
  EventBus.dispatch(Events.AJAX.POST, null, params)
}

//change detection
var addChangeDetection = function () {
  
  var getDefaultState = function () {
    var date         = moment(new Date())
    var defaultState = {
      id                    : guid.random(),
      type                  : Model.TYPES.CHANGE_DETECTION,
      name                  : 'change-detection-' + date.format('YYYY-MM-DD-HHmm'),
      inputRecipe1          : null,
      inputRecipe2          : null,
      fusionTableId         : null,
      fusionTableClassColumn: null,
      algorithm             : 'cart'
    }
    return defaultState
  }
  // View.showMosaic()
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, getDefaultState(), {isNew: true})
}

var changeDetectionRequestData = function (state) {
  return {
    imageType        : Model.TYPES.CHANGE_DETECTION,
    fromImageRecipeId: state.inputRecipe1,
    toImageRecipeId  : state.inputRecipe2,
    fromAssetId      : state.geeAssetId1,
    toAssetId        : state.geeAssetId2,
    tableName        : state.fusionTableId,
    classProperty    : state.fusionTableClassColumn,
    algorithm        : state.algorithm
  }
}

var requestChangeDetection = function (e, state) {
  var data   = changeDetectionRequestData(state)
  var params = {
    url         : '/api/data/change-detection/preview',
    data        : data
    , beforeSend: function () {
      Loader.show()
    }
    , success   : function (response) {
      state.mosaicPreview = true
      state.mosaic        = {mapId: response.mapId, token: response.token}
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.MOSAIC_LOADED, null, state.mosaic.mapId, state.mosaic.token)
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
      
      EventBus.dispatch(Events.SECTION.REDUCE)
      
      Loader.hide({delay: 500})
    }
  }
  EventBus.dispatch(Events.AJAX.POST, null, params)
}

var retrieveChangeDetection = function (e, state, obj) {
  var data         = changeDetectionRequestData(state)
  data.name        = obj.name
  data.destination = obj.destination
  
  var params = {
    url         : '/api/data/change-detection/retrieve'
    , data      : data
    , beforeSend: function () {
      setTimeout(function () {
        EventBus.dispatch(Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager')
      }, 100)
      
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW)
    }
    , success   : function (e) {
      EventBus.dispatch(Events.SECTION.TASK_MANAGER.CHECK_STATUS)
    }
  }
  EventBus.dispatch(Events.AJAX.POST, null, params)
}

//change detection
var addTimeSeries = function () {
  
  var getDefaultState = function () {
    var date         = moment(new Date())
    var defaultState = {
      id         : guid.random(),
      type       : Model.TYPES.TIME_SERIES,
      description: 'time-series-' + date.format('YYYY-MM-DD-HHmm'),
      aoi        : null,
      dataSets   : [],
      fromDate   : date.format('YYYY-MM-DD'),
      toDate     : date.format('YYYY-MM-DD'),
      indicator  : null,
      maskClouds : false,
      maskSnow   : false,
      brdfCorrect: false
    }
    return defaultState
  }
  // View.showMosaic()
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, getDefaultState(), {isNew: true})
}

var getRequestTimeSeriesData = function (state) {
  
  switch (state.indicator) {
    case 'NDVI' :
      state.expression = '10000 * (1 + (i.nir - i.red) / (i.nir + i.red))'
      break
    case 'NDMI' :
      state.expression = '10000 * (1 + (i.nir - i.red) / (i.nir + i.red))'
      break
    case 'EVI' :
      state.expression = '10000 * (1 + (i.nir - i.red) / (i.nir + i.red))'
      break
    case 'EVI2' :
      state.expression = '10000 * (1 + (i.nir - i.red) / (i.nir + i.red))'
      break
  }
  
  state.tile = 'Download time-series: \'' + state.description + '\''
  
  return {
    operation: 'sepal.timeseries.download',
    params   : state
  }
}

var requestTimeSeries = function (e, state) {
  var data = getRequestTimeSeriesData(state)
  
  var params = {
    url         : '/api/tasks'
    , data      : JSON.stringify(data)
    , contentType: "application/json; charset=utf-8"
    , dataType   : "json"
    , beforeSend: function () {
      setTimeout(function () {
        EventBus.dispatch(Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager')
      }, 100)
    }
    , success   : function (e) {
      EventBus.dispatch(Events.SECTION.TASK_MANAGER.CHECK_STATUS)
    }
  }
  EventBus.dispatch(Events.AJAX.POST, null, params)
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.LIST_LOAD, loadList)
EventBus.addEventListener(Events.SECTION.SEARCH.MOSAIC_LOAD, loadMosaic)
EventBus.addEventListener(Events.SECTION.SEARCH.MOSAIC_CLONE, cloneMosaic)
EventBus.addEventListener(Events.SECTION.SEARCH.MOSAIC_DELETE, deleteMosaic)

EventBus.addEventListener(Events.SECTION.SEARCH.VIEW.SHOW_LIST, showList)
EventBus.addEventListener(Events.SECTION.SEARCH.VIEW.ADD_MOSAIC, addMosaic)
EventBus.addEventListener(Events.SECTION.SEARCH.VIEW.ADD_CLASSIFICATION, addClassification)
EventBus.addEventListener(Events.SECTION.SEARCH.REQUEST_CLASSIFICATION, requestClassification)
EventBus.addEventListener(Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_CLASSIFICATION, retrieveClassification)
EventBus.addEventListener(Events.SECTION.SEARCH.VIEW.ADD_CHANGE_DETECTION, addChangeDetection)
EventBus.addEventListener(Events.SECTION.SEARCH.REQUEST_CHANGE_DETECTION, requestChangeDetection)
EventBus.addEventListener(Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_CHANGE_DETECTION, retrieveChangeDetection)
EventBus.addEventListener(Events.SECTION.SEARCH.VIEW.ADD_TIME_SERIES, addTimeSeries)
EventBus.addEventListener(Events.SECTION.SEARCH.REQUEST_TIME_SERIES, requestTimeSeries)
