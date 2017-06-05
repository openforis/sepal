/**
 * @author Mino Togna
 */
require('./search-retrieve.scss')

var EventBus = require('../event/event-bus')
var Events   = require('../event/events')

var Model = require('../search/model/search-model')

var SectionActiveMosaicsList = require('./views/section-active-mosaics-list')
var SectionCreateMosaic      = require('./views/section-create-mosaic')
var SectionClassify          = require('./views/section-classify')
var SectionChangeDetection   = require('./views/section-classify')

var html = null

var init = function () {
  var template = require('./search-retrieve.html')
  html         = $(template({}))
  var id       = html.attr('id')
  
  var app = $('.app')
  if (app.find('#' + id).children().length <= 0) {
    
    $('.app').append(html)
    
    SectionActiveMosaicsList.init(html.find('.active-mosaics'))
    SectionCreateMosaic.init(html.find('.section-create-mosaic'))
    SectionClassify.init(html.find('.section-classify'))
    SectionChangeDetection.init(html.find('.section-change-detection'))
    
  }
}

var show = function () {
  if (!html.is(':visible')) {
    html.velocitySlideDown({delay: 300, duration: 800})
  }
}

var hide = function (opts) {
  var options = {delay: 100, duration: 800}
  options     = $.extend(options, opts)
  html.velocitySlideUp(options)
}

var collapse = function () {
  var defaultSlideOpts = {delay: 50, duration: 500}
  
  SectionCreateMosaic.collapse(defaultSlideOpts)
}

var setActiveState = function (e, state, params) {
  if (params && params.isNew) {
    collapse()
    
    switch (state.type) {
      case Model.TYPES.MOSAIC:
        SectionCreateMosaic.show()
        SectionChangeDetection.hide()
        SectionClassify.hide()
        
        break
      case Model.TYPES.CHANGE_DETECTION:
        SectionCreateMosaic.hide()
        SectionChangeDetection.show()
        SectionClassify.hide()
        
        break
      case Model.TYPES.CLASSIFY:
        SectionCreateMosaic.hide()
        SectionChangeDetection.hide()
        SectionClassify.show()
        
        break
    }
  }
}
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

module.exports = {
  init               : init
  , show             : show
  , hide             : hide
  , collapse         : collapse
  , resetCreateMosaic: SectionCreateMosaic.reset
}