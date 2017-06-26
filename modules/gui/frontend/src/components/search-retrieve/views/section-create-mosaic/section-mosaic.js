/**
 * @author Mino Togna
 */
var EventBus                = require('../../../event/event-bus')
var Events                  = require('../../../event/events')
var FormMosaicPreview       = require('./mosaic/form-mosaic-preview')
var FormMosaicRetrieve      = require('./mosaic/form-mosaic-retrieve')
var FormScenesAutoSelection = require('./scenes/form-scenes-autoselection-form')
var FormScenesRetrieve      = require('./scenes/scenes-retrieve')
var SModel                  = require('../../../search/model/search-model')

var html                = null
var btnPreviewMosaic    = null
var btnRetrieveMosaic   = null
var btnToggleVisibility = null

var state = {}

var init = function (container) {
  html = container
  
  btnPreviewMosaic    = html.find('.btn-preview-mosaic')
  btnRetrieveMosaic   = html.find('.btn-retrieve-mosaic')
  btnToggleVisibility = html.find('.btn-toggle-mosaic-visibility')
  
  FormMosaicPreview.init(html.find('.row-mosaic-preview'))
  FormMosaicRetrieve.init(html.find('.row-mosaic-retrieve'))
  
  initEventHandlers()
  reset()
}

var initEventHandlers = function () {
  
  btnPreviewMosaic.click(function () {
    FormMosaicPreview.toggleVisibility()
    FormScenesAutoSelection.hide()
    FormScenesRetrieve.hide()
    FormMosaicRetrieve.hide()
  })
  
  btnRetrieveMosaic.click(function () {
    FormMosaicPreview.hide()
    FormScenesAutoSelection.hide()
    FormScenesRetrieve.hide()
    FormMosaicRetrieve.toggleVisibility()
  })
  
  btnToggleVisibility.click(function (e) {
    btnToggleVisibility.toggleClass('active')
    EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.TOGGLE_MOSAIC_VISIBILITY)
  })
  
}

var setActiveState = function (e, activeState, params) {
  state = activeState
  // if (params && params.isNew)
  //   btnToggleVisibility.removeClass('active')
  
  if (state && state.type == SModel.TYPES.MOSAIC && state.mosaic && params && (params.isNew || params.loadMosaic))
    btnToggleVisibility.addClass('active')
  else
    btnToggleVisibility.removeClass('active')
  
  if (state && state.mosaic) {
    // if (state && state.mosaicPreviewBand) {
    btnToggleVisibility.enable()
  } else {
    btnToggleVisibility.disable()
  }
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

var collapse = function (options) {
  btnPreviewMosaic.removeClass('active')
  btnRetrieveMosaic.removeClass('active')
  
  FormMosaicPreview.hide(options)
  FormMosaicRetrieve.hide(options)
}

var reset = function () {
  collapse({delay: 0, duration: 0})
  btnToggleVisibility.removeClass('active')
  
  FormMosaicPreview.reset()
  FormMosaicRetrieve.reset()
}

module.exports = {
  init      : init
  , collapse: collapse
  , reset   : reset
}