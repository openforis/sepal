var EventBus      = require('./../../event/event-bus')
var Events        = require('./../../event/events')
var FormValidator = require('../../form/form-validator')
var Model         = require('./../model/search-model')

var state = {}

var form                   = null
var formNotify             = null
var name                   = null
var inputRecipe            = null
var fusionTableId          = null
var fusionTableClassColumn = null
var algorithm              = null

var init = function (container) {
  form       = container.find('form')
  formNotify = form.find('.form-notify')
  
  name                   = form.find('input[name=name]')
  inputRecipe            = form.find('input[name=input-recipe]')
  fusionTableId          = form.find('input[name=name]')
  fusionTableClassColumn = form.find('input[name=name]')
  algorithm              = form.find('input[name=name]')
  
  form.submit(submit)
}

var submit = function (e) {
  e.preventDefault()
  
  FormValidator.resetFormErrors(form, formNotify)
  
}

// model change methods
var setState = function (e, newState, params) {
  FormValidator.resetFormErrors(form, formNotify)
  state = newState
  
  if (state && state.type == Model.TYPES.CLASSIFY) {
    console.log(state)
  }
  
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)

module.exports.init = init