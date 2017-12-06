/**
 * @author Mino Togna
 */

var EventBus      = require('../../event/event-bus')
var Events        = require('../../event/events')
var FormValidator = require('../../form/form-validator')
var DatePicker    = require('../../date-picker/date-picker')
var SepalAois     = require('../../sepal-aois/sepal-aois')
var Model         = require('./../model/search-model')
var moment        = require('moment')

var state = {}

var form       = null
var formNotify = null

var description   = null
var dataSets      = null
var fromDate      = null
var fromDateLabel = null
var toDate        = null
var toDateLabel   = null
var indicator     = null
var otherOptions  = null

var init = function (container) {
  form       = container.find('form')
  formNotify = form.find('.form-notify')
  
  description   = form.find('[name=description]')
  dataSets      = form.find('.row-sensor')
  fromDate      = DatePicker.newInstance(form.find('.from-date')).hide()
  fromDateLabel = form.find('.from-date-label')
  toDate        = DatePicker.newInstance(form.find('.to-date')).hide()
  toDateLabel   = form.find('.to-date-label')
  indicator     = form.find('.row-indicator')
  otherOptions  = form.find('.row-other-options')
  
  initEventHandlers()
}

var initEventHandlers = function () {
  description.change(function (e) {
    state.description = description.val()
  })
  
  dataSets.find('button').click(function (e) {
    var btn = $(e.target)
    btn.toggleClass('active')
    if (btn.hasClass('active'))
      state.dataSets.push(btn.val())
    else
      state.dataSets.splice(state.dataSets.indexOf(btn.val()), 1)
  })
  
  fromDate.onChange = function (year, month, day) {
    state.fromDate = year + '-' + month + '-' + day
  }
  fromDateLabel.click(function (e) {
    fromDate.toggle()
  })
  
  toDate.onChange = function (year, month, day) {
    state.toDate = year + '-' + month + '-' + day
  }
  toDateLabel.click(function (e) {
    toDate.toggle()
  })
  
  var indicatorBtns = indicator.find('button')
  indicatorBtns.click(function (e) {
    e.preventDefault()
    var btn = $(e.target)
    if (!btn.hasClass('active')) {
      indicatorBtns.removeClass('active')
      btn.addClass('active')
      state.indicator = btn.val()
    }
  })
  
  otherOptions.find('button').click(function (e) {
    e.preventDefault()
    var btn = $(e.target)
    btn.toggleClass('active')
    if (btn.hasClass('active'))
      state[btn.val()] = true
    else
      state[btn.val()] = false
  })
  
  form.submit(submit)
}

var submit = function (e) {
  e.preventDefault()
  
  FormValidator.resetFormErrors(form, formNotify)
  
  console.log('==== Submitting time series', state)
}

// model change methods. now only adding time series is allowed (not editing)
var setState = function (e, newState, params) {
  FormValidator.resetFormErrors(form, formNotify)
  state = newState
  
  if (state && state.type == Model.TYPES.TIME_SERIES) {
    description.val(state.description)
    
    var date               = moment(state.fromDate)
    // setTimeout(function () {
    fromDate.triggerChange = false
    fromDate.select('year', date.format('YYYY'))
    fromDate.select('month', date.format('MM'))
    fromDate.select('day', date.format('DD'))
    fromDate.triggerChange = true
    // }, 400)
    
    date                 = moment(state.toDate)
    // setTimeout(function () {
    toDate.triggerChange = false
    toDate.select('year', date.format('YYYY'))
    toDate.select('month', date.format('MM'))
    toDate.select('day', date.format('DD'))
    toDate.triggerChange = true
  }
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)

module.exports.init = init