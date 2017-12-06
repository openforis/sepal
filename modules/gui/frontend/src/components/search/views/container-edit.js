/**
 * @author Mino Togna
 */
var EventBus            = require('./../../event/event-bus')
var Events              = require('./../../event/events')
var SearchForm          = require('./search-form')
var ClassifyForm        = require('./classify-form')
var ChangeDetectionForm = require('./change-detection-form')
var TimeSeriesForm      = require('./time-series-form')

var container              = null
var sectionSearchForm      = null
var sectionClassify        = null
var sectionChangeDetection = null
var sectionTimeSeries      = null
var state                  = {}

var showSectionOpts = {delay: 0, duration: 0}

var init = function (html) {
  container              = $(html)
  sectionSearchForm      = container.find('.section-search-form')
  sectionClassify        = container.find('.section-classify')
  sectionChangeDetection = container.find('.section-change-detection')
  sectionTimeSeries      = container.find('.section-time-series')
  
  SearchForm.init(sectionSearchForm.find('form'))
  ClassifyForm.init(sectionClassify)
  ChangeDetectionForm.init(sectionChangeDetection)
  TimeSeriesForm.init(sectionTimeSeries)
  
  hideSection(sectionSearchForm, showSectionOpts)
  hideSection(sectionClassify, showSectionOpts)
  hideSection(sectionChangeDetection, showSectionOpts)
  hideSection(sectionTimeSeries, showSectionOpts)
  
  container.find('.btn-show-list').click(function () {
    EventBus.dispatch(Events.SECTION.SEARCH.VIEW.SHOW_LIST)
  })
  
}

var showSection = function (section, opts) {
  show()
  if (!section.is(':visible'))
    section.show()
}

var hideSection = function (section, opts) {
  section.hide()
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
  hideSection(sectionClassify)
  hideSection(sectionChangeDetection)
  hideSection(sectionTimeSeries)
  showSection(sectionSearchForm)
}

var showClassification = function () {
  hideSection(sectionSearchForm)
  hideSection(sectionChangeDetection)
  hideSection(sectionTimeSeries)
  showSection(sectionClassify)
}

var showChangeDetection = function () {
  hideSection(sectionSearchForm)
  hideSection(sectionClassify)
  hideSection(sectionTimeSeries)
  showSection(sectionChangeDetection)
}

var showTimeSeries = function () {
  hideSection(sectionSearchForm)
  hideSection(sectionClassify)
  hideSection(sectionChangeDetection)
  showSection(sectionTimeSeries)
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)

module.exports = {
  init                 : init
  , show               : show
  , hide               : hide
  , showMosaic         : showMosaic
  , showClassification : showClassification
  , showChangeDetection: showChangeDetection
  , showTimeSeries     : showTimeSeries
}