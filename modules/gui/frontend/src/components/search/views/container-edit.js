/**
 * @author Mino Togna
 */
var EventBus = require('./../../event/event-bus')
var Events   = require('./../../event/events')
var Form     = require('./search-form')

var container              = null
var sectionSearchForm      = null
var sectionClassify        = null
var sectionChangeDetection = null
var state                  = {}

var init = function (html) {
  container              = $(html)
  sectionSearchForm      = container.find('.section-search-form')
  sectionClassify        = container.find('.section-classify')
  sectionChangeDetection = container.find('.section-change-detection')
  
  Form.init(sectionSearchForm.find('form'))
  
  var initOpts = {delay: 0, duration: 0}
  hideSection(sectionSearchForm, initOpts)
  hideSection(sectionClassify, initOpts)
  hideSection(sectionChangeDetection, initOpts)
  
  container.find('.btn-show-list').click(function () {
    EventBus.dispatch(Events.SECTION.SEARCH.VIEW.SHOW_LIST)
  })

}

var showSection = function (section, opts) {
  show()
  section.velocityFadeIn(opts)
}

var hideSection = function (section, opts) {
  section.velocityFadeOut(opts)
}

var setState = function (e, s) {
  state = s
}

var show = function () {
  if (container && !container.is(':visible'))
    container.velocityFadeIn({delay: 0, duration: 300})
}

var hide = function () {
  if (container && container.is(':visible'))
    container.velocityFadeOut({delay: 0, duration: 300})
}

var showMosaic = function () {
  showSection(sectionSearchForm)
  hideSection(sectionClassify)
  hideSection(sectionChangeDetection)
}

var showClassification = function () {
  hideSection(sectionSearchForm)
  showSection(sectionClassify)
  hideSection(sectionChangeDetection)
}

var showChangeDetection = function () {
  hideSection(sectionSearchForm)
  hideSection(sectionClassify)
  showSection(sectionChangeDetection)
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)

module.exports = {
  init                 : init
  , show               : show
  , hide               : hide
  , showMosaic         : showMosaic
  , showClassification : showClassification
  , showChangeDetection: showChangeDetection
}