/**
 * @author Mino Togna
 */
require('./container-list.scss')

var EventBus = require('../../event/event-bus')
var Events   = require('../../event/events')
var Dialog   = require('../../dialog/dialog')

var container      = null
var tableHeader    = null
var containerItems = null
var rowTemplate    = null
var activeState    = null

var init = function (html) {
  
  container      = $(html)
  tableHeader    = container.find('.row-header')
  containerItems = container.find('.container-items')
  rowTemplate    = container.find('.template')
  
  var showSection = function (e) {
    EventBus.dispatch(e)
  }
  
  container.find('.btn-add-mosaic').click(function () {
    showSection(Events.SECTION.SEARCH.VIEW.ADD_MOSAIC)
  })
  container.find('.btn-add-classification').click(function () {
    showSection(Events.SECTION.SEARCH.VIEW.ADD_CLASSIFICATION)
  })
  container.find('.btn-add-change-detection').click(function () {
    showSection(Events.SECTION.SEARCH.VIEW.ADD_CHANGE_DETECTION)
  })
  
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.LIST_LOAD)
}

var listChanged = function (e, list) {
  list.length > 0 ? tableHeader.show() : tableHeader.hide()
  
  containerItems.empty()
  $.each(list, function (i, item) {
    var row = rowTemplate.clone().removeClass('template').hide()
    row.addClass('mosaic-' + item.id)
    row.find('.name').html(item.name)
    row.find('.type').html(item.type)
    row.find('.btn-edit').click(function (e) {
      EventBus.dispatch(Events.SECTION.SEARCH.MOSAIC_LOAD, null, item.id)
    })
    row.find('.btn-clone').click(function (e) {
      EventBus.dispatch(Events.SECTION.SEARCH.MOSAIC_CLONE, null, item.id)
    })
    row.find('.btn-delete').click(function (e) {
      e.preventDefault()
      var options = {
        message    : 'Delete ' + item.name + ' ?'
        , onConfirm: function () {
          EventBus.dispatch(Events.SECTION.SEARCH.MOSAIC_DELETE, null, item.id)
        }
      }
      Dialog.show(options)
    })
    
    containerItems.append(row)
    
    setTimeout(function () {
      row.fadeIn(50)
    }, i * 70)
  })
  highlightActive()
}

var show = function () {
  if (container && !container.is(':visible'))
    container.velocityFadeIn({delay: 0, duration: 300})
}

var hide = function () {
  if (container && container.is(':visible'))
    container.velocityFadeOut({delay: 0, duration: 300})
}

var activeChanged = function (e, state) {
  activeState = state
  highlightActive()
}

var highlightActive = function () {
  containerItems.find('.row-mosaic').removeClass('active')
  if (activeState)
    containerItems.find('.mosaic-' + activeState.id).addClass('active')
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.LIST_CHANGED, listChanged)
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, activeChanged)

module.exports = {
  init  : init
  , show: show
  , hide: hide
}