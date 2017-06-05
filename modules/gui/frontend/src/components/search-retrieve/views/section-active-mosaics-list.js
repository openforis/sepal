/**
 * @author Mino Togna
 */

require('./section-active-mosaics-list.scss')

var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')
var Dialog   = require('../../dialog/dialog')

var container     = null
var listContainer = null

var listMosaics  = {}
var activeMosaic = null
var btnSave      = null

var init = function (c) {
  container     = $(c)
  listContainer = container.find('.active-mosaics-btns')
  btnSave       = container.find('.btn-save')
  
  btnSave.click(function (e) {
    e.preventDefault()
    var options = {
      message    : 'Save ' + activeMosaic.name + ' ?'
      , onConfirm: function () {
        EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_SAVE, null, activeMosaic)
      }
    }
    Dialog.show(options)
  })
}

var setActiveState = function (e, state) {
  addMosaic(state)
  
  listContainer.find('.mosaic-item').removeClass('active')
  
  var div = listContainer.find('.mosaic-' + state.id).addClass('active')
  var btn = div.find('.btn-mosaic')
  btn.html(state.name)
  btnSave.insertAfter(btn)
  activeMosaic = btn.data('mosaic')
}
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

var addMosaic = function (state) {
  if (!listMosaics[state.id]) {
    listMosaics[state.id] = state
    
    var div = $('<div class="mosaic-item">' +
      '<button class="btn btn-base btn-close"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      '</div>')
    div.addClass('mosaic-' + state.id)
    
    var btn = $('<button class="btn btn-base btn-mosaic"></button>')
    btn.data('mosaic', state)
    btn.html(state.name)
    btn.click(function (e) {
      e.preventDefault()
      
      if (!div.hasClass('active')) {
        EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, listMosaics[state.id])
      }
    })
    
    div.append(btn)
    listContainer.append(div)
  }
}

module.exports = {
  init: init
}