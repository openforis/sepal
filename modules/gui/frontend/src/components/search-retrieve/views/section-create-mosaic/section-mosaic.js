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
var noUiSlider              = require('nouislider')
var mosaicOptions           = $(require('./mosaic-options.html')({}))

var html                  = null
var btnPreviewMosaic      = null
var btnRetrieveMosaic     = null
var btnToggleVisibility   = null
var sliderTargetDay       = null
var sliderShadowTolerance = null
var btnOptions            = null

var state = {}

var init = function (container) {
  html = container
  
  btnPreviewMosaic    = html.find('.btn-preview-mosaic')
  btnRetrieveMosaic   = html.find('.btn-retrieve-mosaic')
  btnToggleVisibility = html.find('.btn-toggle-mosaic-visibility')
  
  FormMosaicPreview.init(html.find('.row-mosaic-preview'))
  FormMosaicRetrieve.init(html.find('.row-mosaic-retrieve'))
  
  addMosaicOptions(html.find('.row-mosaic-preview'))
  addMosaicOptions(html.find('.row-mosaic-retrieve'))
  
  sliderTargetDay       = html.find('.target-day-slider')
  sliderShadowTolerance = html.find('.shadow-tolerance-slider')
  btnOptions            = html.find('.btn-mosaic-option')
  
  initSliders()
  initEventHandlers()
  reset()
}

var addMosaicOptions = function (container) {
  mosaicOptions.clone().insertBefore(container.find('.row-form-notify'))
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
    state.mosaicPreview = !btnToggleVisibility.hasClass('active')
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
    EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.TOGGLE_MOSAIC_VISIBILITY)
  })
  
  btnOptions.click(function (e) {
    e.preventDefault()
    var btn         = $(e.target)
    var property    = btn.val()
    state[property] = !btn.hasClass('active')
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
    
    if (property === 'median') {
      if (state.median) {
        FormMosaicPreview.disableDateBands()
        FormMosaicRetrieve.disableDateBands()
      } else {
        FormMosaicPreview.enableDateBands()
        FormMosaicRetrieve.enableDateBands()
      }
    }
  })
  
}

var initSliders = function () {
  var initSlider = function (sliders, property) {
    $.each(sliders, function (i, slider) {
      slider = $(slider).get(0)
      if (!slider.hasOwnProperty('noUiSlider')) {
        
        noUiSlider.create(slider, {
          start: [0.5],
          step : 0.05,
          range: {
            'min': [0],
            'max': [1]
          }
        }, true)
        
        slider.noUiSlider.on('change', function () {
          state[property] = slider.noUiSlider.get()
          EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
        })
      }
    })
  }
  initSlider(sliderTargetDay, 'mosaicTargetDay')
  initSlider(sliderShadowTolerance, 'mosaicShadowTolerance')
}

var setActiveState = function (e, activeState, params) {
  state = activeState
  // if (params && params.isNew)
  //   btnToggleVisibility.removeClass('active')
  
  if (state && state.mosaicPreview && state.mosaic)
    btnToggleVisibility.addClass('active')
  else
    btnToggleVisibility.removeClass('active')
  
  if (state && state.mosaic) {
    // if (state && state.mosaicPreviewBand) {
    btnToggleVisibility.enable()
  } else {
    btnToggleVisibility.disable()
  }
  
  if (state && state.type === SModel.TYPES.MOSAIC) {
    $.each(sliderTargetDay, function (i, slider) {
      $(slider).get(0).noUiSlider.set(state.mosaicTargetDay)
    })
    $.each(sliderShadowTolerance, function (i, slider) {
      $(slider).get(0).noUiSlider.set(state.mosaicShadowTolerance)
    })
    
    $.each(btnOptions, function (i, btn) {
      btn          = $(btn)
      var property = btn.val()
      state[property] ? btn.addClass('active') : btn.removeClass('active')
    })
    
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