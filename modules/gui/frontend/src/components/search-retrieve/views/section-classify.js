/**
 * @author Mino Togna
 */
var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')

var container = null
var state     = {}

var init = function (c) {
  container = $(c)
}

var show = function () {
  // if (!container.is(':visible')) {
    container.velocityFadeIn({ delay: 0, duration: 50 })
  // }
}

var hide = function () {
    container.velocityFadeOut({ delay: 0, duration: 50 })
  // if (container.is(':visible')) {
  //   container.velocityFadeOut({ delay: 0, duration: 50 })
  // }
}

var setActiveState = function (activeState) {
  state = activeState
  if (!state)
    container.hide(0)
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

module.exports = {
  init            : init
  , show          : show
  , hide          : hide
  , setActiveState: setActiveState
}