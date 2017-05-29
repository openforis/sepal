/**
 * @author Mino Togna
 */
require('./container-list.scss')

var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')

var container      = null
var tableHeader    = null
var containerItems = null
var rowTemplate    = null

var init = function (html) {
  
  container      = $(html)
  tableHeader    = container.find('.row-header')
  containerItems = container.find('.container-items')
  rowTemplate    = container.find('.template')
  
  var showSection = function (e) {
    EventBus.dispatch(e)
  }
  
  container.find('.btn-add-mosaic').click(function () {
    showSection(Events.SECTION.SEARCH.VIEW.SHOW_MOSAIC)
  })
  container.find('.btn-add-classification').click(function () {
    showSection(Events.SECTION.SEARCH.VIEW.SHOW_CLASSIFICATION)
  })
  container.find('.btn-add-change-detection').click(function () {
    showSection(Events.SECTION.SEARCH.VIEW.SHOW_CHANGE_DETECTION)
  })
  
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.LIST_LOAD)
}

var listChanged = function (e, list) {
  list.length > 0 ? tableHeader.show() : tableHeader.hide()
  
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

var show = function () {
  if (!container.is(':visible'))
    container.velocityFadeIn({delay: 0, duration: 300})
}

var hide = function () {
  if (container.is(':visible'))
    container.velocityFadeOut({delay: 0, duration: 300})
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.LIST_CHANGED, listChanged)

module.exports = {
  init  : init
  , show: show
  , hide: hide
}