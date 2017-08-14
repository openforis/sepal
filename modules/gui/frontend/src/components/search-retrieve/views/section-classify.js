/**
 * @author Mino Togna
 */
var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')
var Model    = require('./../../search/model/search-model')
var Dialog   = require('./../../dialog/dialog')

var state       = {}
var container   = null
var btnPreview  = null
var btnRetrieve = null

var init = function (c) {
  container = $(c)
  
  btnPreview  = container.find('.btn-preview')
  btnRetrieve = container.find('.btn-retrieve')
  
  btnPreview.click(function (e) {
    e.preventDefault()
    state.mosaicPreview = !btnPreview.hasClass('active')
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
    EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.TOGGLE_MOSAIC_VISIBILITY)
  })
  
  btnRetrieve.click(function (e) {
    e.preventDefault()
  
    var options = {
      message    : 'Retrieve classification mosaic ' + state.name +' ?'
      , onConfirm: function () {
        //TODO
      }
    }
    Dialog.show(options)
  })
}

var show = function () {
  // if (!container.is(':visible')) {
  container.velocityFadeIn({delay: 0, duration: 50})
  // }
}

var hide = function () {
  container.velocityFadeOut({delay: 0, duration: 50})
  // if (container.is(':visible')) {
  //   container.velocityFadeOut({ delay: 0, duration: 50 })
  // }
}

var setActiveState = function (e, activeState) {
  state = activeState
  if (!state)
    container.hide(0)
  else if (state.type === Model.TYPES.CLASSIFY) {
    (state.mosaicPreview) ? btnPreview.addClass('active') : btnPreview.removeClass('active')
  }
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

module.exports = {
  init            : init
  , show          : show
  , hide          : hide
  , setActiveState: setActiveState
}