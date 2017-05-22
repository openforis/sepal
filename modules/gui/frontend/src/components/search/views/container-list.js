/**
 * @author Mino Togna
 */
require('./container-list.scss')

var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')

var containerItems = null
var rowTemplate    = null

var init = function (container) {
  
  containerItems = container.find('.container-items')
  rowTemplate    = container.find('.template')
  
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.LIST_LOAD)
}

var listChanged = function (e, list) {
  console.log(list)
  containerItems.empty()
  $.each(list, function (i, item) {
    var row = rowTemplate.clone().removeClass('template').hide()
    row.find('.name').html(item.name)
    row.find('.type').html(item.type)
    
    containerItems.append(row)
    setTimeout(function () {
      row.fadeIn(50)
    }, i * 70)
  })
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.LIST_CHANGED, listChanged)

module.exports = {
  init: init
}