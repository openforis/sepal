/**
 * @author Mino Togna
 */

var EventBus = require('../event/event-bus')
var Events   = require('../event/events')
var Loader   = require('../loader/loader')

var SearchRequestUtils = require('./../search/search-request-utils')

var getRequestData = function (state, bands) {
  var data = {
    targetDayOfYearWeight: 0.5
    , bands              : bands
    , dataSet            : state.sensorGroup
  }
  SearchRequestUtils.addSceneIds(state, data)
  SearchRequestUtils.addAoiRequestParameter(state, data)
  SearchRequestUtils.addTargetDayOfYearRequestParameter(state, data)
  
  data.mosaicTargetDay       = state.mosaicTargetDay
  data.mosaicShadowTolerance = state.mosaicShadowTolerance
  data.maskSnow              = state.maskSnow
  data.brdfCorrect           = state.brdfCorrect
  data.median                = state.median
  
  return data
}

var previewMosaic = function (e, state) {
  var data   = getRequestData(state, state.mosaicPreviewBand)
  var params = {
    url         : '/api/data/mosaic/preview'
    , data      : data
    , beforeSend: function () {
      Loader.show()
    }
    , success   : function (response) {
      state.mosaic = {mapId: response.mapId, token: response.token}
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.MOSAIC_LOADED, null, state.mosaic.mapId, state.mosaic.token)
      // EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {loadMosaic:true})
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW)
      
      Loader.hide({delay: 500})
    }
  }
  
  EventBus.dispatch(Events.AJAX.POST, null, params)
}

var retrieveMosaic = function (e, state, obj) {
  var data  = getRequestData(state, obj.bands)
  data.name = obj.name
  
  var params = {
    url         : '/api/data/mosaic/retrieve'
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

//mosaic section search retrieve events
EventBus.addEventListener(Events.SECTION.SEARCH_RETRIEVE.PREVIEW_MOSAIC, previewMosaic)

EventBus.addEventListener(Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_MOSAIC, retrieveMosaic)
