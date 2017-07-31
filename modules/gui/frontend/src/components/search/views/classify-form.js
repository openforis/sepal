var EventBus      = require('./../../event/event-bus')
var Events        = require('./../../event/events')
var FormValidator = require('../../form/form-validator')
var Model         = require('./../model/search-model')

var state   = {}
var mosaics = []

var form                    = null
var formNotify              = null
var name                    = null
var inputRecipe             = null
var inputRecipeAutocomplete = null
var fusionTableId           = null
var fusionTableClassColumn  = null
var rowAlgorithms           = null

var init = function (container) {
  form       = container.find('form')
  formNotify = form.find('.form-notify')
  
  name                   = form.find('input[name=name]')
  inputRecipe            = form.find('input[name=input-recipe]')
  fusionTableId          = form.find('input[name=fusion-table-id]')
  fusionTableClassColumn = form.find('input[name=fusion-table-class-column]')
  rowAlgorithms          = form.find('.row-algorithm-btns')
  
  initEvents()
  
  form.submit(submit)
}

var initEvents = function () {
  name.change(function (e) {
    state.name = name.val()
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {field: 'name'})
  })
  fusionTableId.change(function (e) {
    state.fusionTableId = fusionTableId.val()
  })
  fusionTableClassColumn.change(function (e) {
    state.fusionTableClassColumn = fusionTableClassColumn.val()
  })
  
  var btns = rowAlgorithms.find('button')
  btns.click(function (e) {
    var btn = $(e.target)
    if (!btn.hasClass('active')) {
      btns.removeClass('active')
      btn.addClass('active')
      state.algorithm = btn.val()
    }
  })
  
  updateInputRecipe()
}

var submit = function (e) {
  e.preventDefault()
  
  FormValidator.resetFormErrors(form, formNotify)
  
}

// model change methods
var setState = function (e, newState, params) {
  FormValidator.resetFormErrors(form, formNotify)
  
  if (newState && newState.type == Model.TYPES.CLASSIFY && (!state || newState.id !== state.id)) {
    
    name.val(newState.name)
    
    var mosaic = mosaics.find(function (o) {
      return o.id == newState.inputRecipe
    })
    if (mosaic)
      inputRecipe.val(mosaic.name).data('reset-btn').enable()
    
    fusionTableId.val(newState.fusionTableId)
    fusionTableClassColumn.val(newState.fusionTableClassColumn)
    rowAlgorithms.find('button').removeClass('active')
    if (newState.algorithm)
      rowAlgorithms.find('button[value=' + newState.algorithm + ']').addClass('active')
  }
  
  state = newState
  
}

var listMosaicsChanged = function (e, list) {
  mosaics = list
  updateInputRecipe()
}

var updateInputRecipe = function () {
  var getRecipeOpt = function (mosaic) {
    return {data: mosaic.id, value: mosaic.name}
  }
  
  if (inputRecipeAutocomplete)
    inputRecipeAutocomplete.sepalAutocomplete('dispose')
  
  inputRecipeAutocomplete = inputRecipe.sepalAutocomplete({
    lookup  : mosaics.map(getRecipeOpt),
    onChange: function (selection) {
      state.inputRecipe = selection ? selection.data : null
    }
  })
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.LIST_CHANGED, listMosaicsChanged)

module.exports.init = init