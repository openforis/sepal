/**
 * @author Mino Togna
 */
// var moment   = require( 'moment' )
var EventBus           = require('../event/event-bus')
var Events             = require('../event/events')
var Loader             = require('../loader/loader')
var View               = require('./search-v')
var SearchRequestUtils = require('./search-request-utils')

// deprecated
// require( './search-params-mv' )
// var SearchParams = require( '../search/search-params' )

require('../scene-areas/scene-areas-mv')
require('../scenes-selection/scenes-selection-mv')
require('../search-retrieve/search-retrieve-mv')
require('../scene-area-mosaics/scene-area-mosaics-mv')

var show = function (e, type) {
  if (type == 'search') {
    View.init()
  }
}

var requestSceneAreas = function (e, state) {
  var data     = {}
  data.dataSet = state.sensorGroup
  SearchRequestUtils.addAoiRequestParameter(state, data)
  
  var params = {
    url         : '/api/data/sceneareas'
    , data      : data
    , beforeSend: function () {
      // EventBus.dispatch( Events.SCENE_AREAS.INIT )
      Loader.show()
    }
    , success   : function (response) {
      state.sceneAreas = {}
      $.each(response, function (i, sceneArea) {
        state.sceneAreas[sceneArea.sceneAreaId] = {polygon: sceneArea.polygon, selection: []}
      })
      state.mosaicPreviewBand = null
      
      // EventBus.dispatch( Events.SECTION.SEARCH.SCENE_AREAS_LOADED , null , response)
      // EventBus.dispatch( Events.SECTION.SEARCH.LANDSAT_SCENE_AREAS_LOADED, null, response )
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {resetSceneAreas: true})
      EventBus.dispatch(Events.SECTION.REDUCE)
      Loader.hide({delay: 300})
    }
  }
  EventBus.dispatch(Events.AJAX.POST, null, params)
  
  // Loader.show()
  // EventBus.dispatch( Events.SCENE_AREAS.INIT )
  // landsatRequest( params, data )
  // sentinel2Request( params, data )
}

EventBus.addEventListener(Events.SECTION.SHOW, show)
EventBus.addEventListener(Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, requestSceneAreas)

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.LIST_LOAD, function (e) {
  var params = {
    url    : '/api/mosaics/list',
    success: function (response) {
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.LIST_CHANGED, null, response)
    }
  }
  EventBus.dispatch(Events.AJAX.GET, null, params)
})