/**
 * @author Mino Togna
 */
var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')

var SectionScenes = require('./section-create-mosaic/section-scenes')
var SectionMosaic = require('./section-create-mosaic/section-mosaic')
var Model         = require('./../../search/model/search-model')

var container = null
var state     = {}

var init = function (c) {
  container = $(c)
  
  SectionScenes.init(container)
  SectionMosaic.init(container)
  
  var btnsToggleSection = container.find('.btn-toggle-section')
  btnsToggleSection.click(function () {
    var btn = $(this)
    
    btnsToggleSection.not(btn).removeClass('active')
    
    btn.toggleClass('active').addClass('disabling').disable()
    
    setTimeout(function () {
      btn.removeClass('disabling').enable()
    }, 500)
  })
  
}

var show = function () {
  // if (!container.is(':visible')) {
    container.velocityFadeIn({ delay: 0, duration: 50 })
  // }
}

var hide = function () {
  // if (container.is(':visible')) {
    container.velocityFadeOut({ delay: 0, duration: 50 })
  // }
}

var setActiveState = function (e, activeState) {
  state      = activeState
  var enable = false
  if (!state)
    container.hide(0)
  else if (state.type == Model.TYPES.MOSAIC) {
    if (state.sceneAreas) {
      $.each(state.sceneAreas, function (i, scene) {
        if (scene.selection.length > 0) {
          enable = true
          return false
        }
      })
    }
  }
  if (enable) enableScenesRequiredButtons()
  else disableScenesRequiredButtons()
}
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

var reset = function () {
  disableScenesRequiredButtons()
  
  SectionScenes.reset()
  SectionMosaic.reset()
}

var collapse = function (opts) {
  SectionScenes.collapse(opts)
  SectionMosaic.collapse(opts)
}

var enableScenesRequiredButtons = function () {
  container.find('.btn-scenes-required').enable()
}

var disableScenesRequiredButtons = function () {
  container.find('.btn-scenes-required').disable()
}

module.exports = {
  init            : init
  , show          : show
  , hide          : hide
  , setActiveState: setActiveState
  , reset         : reset
  , collapse      : collapse
}