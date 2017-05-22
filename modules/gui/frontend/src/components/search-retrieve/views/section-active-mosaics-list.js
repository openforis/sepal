/**
 * @author Mino Togna
 */

require('./section-active-mosaics-list.scss')

var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')
var Dialog   = require('../../dialog/dialog')

var container = null
var btnList   = null

var listMosaics  = {}
var activeMosaic = null
var btnSave      = null

var init = function (c) {
  container = $(c)
  btnList   = container.find('.active-mosaics-btns')
  btnSave   = container.find('.btn-save')
  
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
  
  btnList.find('button').removeClass('active')
  
  var btn = btnList.find('button.btn-mosaic-' + state.id)
  btn.addClass('active').html(state.name)
  btnSave.insertAfter(btn)
  activeMosaic = btn.data('mosaic')
}
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

var addMosaic = function (state) {
  if (!listMosaics[state.id]) {
    listMosaics[state.id] = state
    
    var btn = $('<button class="btn btn-base btn-mosaic"></button>')
    btn.addClass('btn-mosaic-' + state.id)
    btn.data('mosaic', state)
    btn.html(state.name)
    btn.click(function (e) {
      e.preventDefault()
      
      if (!btn.hasClass('active')) {
        EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, listMosaics[id])
      }
    })
    
    btnList.append(btn)
  }
}

module.exports = {
  init: init
}