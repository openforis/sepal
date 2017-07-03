/**
 * @author Mino Togna
 */
var EventBus     = require('../event/event-bus')
var Events       = require('../event/events')
var View         = require('./scene-area-mosaics-v')
var SModel       = require('../search/model/search-model')
var currentState = null

var reset = function () {
  View.reset()
}

var addMosaic = function (e, mapId, token) {
  View.addMosaic(mapId, token)
}

var toggleMosaicVisibility = function (e) {
  View.toggleMosaicVisibility()
}

var hideMosaic = function () {
  View.hideMosaic()
}

var showMosaic = function () {
  View.showMosaic()
}

var stateChange = function (e, state, params) {
  if (!state)
    View.reset()
  else if (currentState && currentState.id !== state.id) {
    if (state.mosaic)
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.MOSAIC_LOADED, null, state.mosaic.mapId, state.mosaic.token)
    else
      View.reset()
  }
  
  currentState = state
  // if (state && state.type == SModel.TYPES.MOSAIC && state.mosaic && params && (params.isNew ||params.loadMosaic))
  //   addMosaic(null, state.mosaic.mapId, state.mosaic.token)
  // else
  //   View.reset()
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, stateChange)

EventBus.addEventListener(Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, reset)

// add mosaic events
EventBus.addEventListener(Events.SECTION.SEARCH_RETRIEVE.MOSAIC_LOADED, addMosaic)

//toggle visibility events
EventBus.addEventListener(Events.SECTION.SEARCH_RETRIEVE.TOGGLE_MOSAIC_VISIBILITY, toggleMosaicVisibility)
EventBus.addEventListener(Events.SECTION.SHOW, hideMosaic)
EventBus.addEventListener(Events.SECTION.REDUCE, showMosaic)