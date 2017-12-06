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

var description  = null
var dataSets     = null
var indicator    = null
var otherOptions = null

var init = function (container) {
  form       = container.find('form')
  formNotify = form.find('.form-notify')
  
  description  = form.find('[name=description]')
  dataSets     = form.find('.row-sensor')
  indicator    = form.find('.row-indicator')
  otherOptions = form.find('.row-other-options')
  
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
  }
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)

module.exports.init = init