/**
 * @author Mino Togna
 */
require('./search.scss')

var EventBus = require('../event/event-bus')
var Events   = require('../event/events')
var Model    = require('./model/search-model')
// html
var html     = null

var state = null

// ui components
var section       = null
var ContainerEdit = require('./views/container-edit')
var ContainerList = require('./views/container-list')

var init = function () {
  var template = require('./search.html')
  html         = $(template({}))
  
  var appSection = $('#app-section').find('.search')
  if (appSection.children().length <= 0) {
    appSection.append(html)
    
    section = appSection.find('#search')
    
    ContainerEdit.init(section.find('.mode-edit-container'))
    ContainerList.init(section.find('.mode-list-container'))
  }
  
}

var showList = function () {
  ContainerList.show()
  ContainerEdit.hide()
}

var showMosaic = function () {
  ContainerList.hide()
  ContainerEdit.showMosaic()
}

var showClassification = function () {
  ContainerList.hide()
  ContainerEdit.showClassification()
}

var showChangeDetection = function () {
  ContainerList.hide()
  ContainerEdit.showChangeDetection()
}

var activeStateChanged = function (e, s, params) {
  if (!s)
    showList()
  else if (!state || (state && s.id !== state.id)) {
    switch (s.type) {
      case Model.TYPES.MOSAIC:
        showMosaic()
        break
      case Model.TYPES.CLASSIFY:
        showClassification()
        break
      case Model.TYPES.CHANGE_DETECTION:
        showChangeDetection()
        break
    }
  }
  state = s
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, activeStateChanged)

module.exports = {
  init                 : init
  , showList           : showList
  , showMosaic         : showMosaic
  , showClassification : showClassification
  , showChangeDetection: showChangeDetection
}