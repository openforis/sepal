var EventBus         = require('./../../event/event-bus')
var Events           = require('./../../event/events')
var FormValidator    = require('../../form/form-validator')
var Model            = require('./../model/search-model')
var GoogleMapsLoader = require('google-maps')
var UserMV           = require('../../user/user-mv')

var state   = {}
var mosaics = []

var form                               = null
var formNotify                         = null
var name                               = null
var inputRecipe1                       = null
var inputRecipe2                       = null
var inputRecipe1Autocomplete           = null
var inputRecipe2Autocomplete           = null
var geeAssetId1                        = null
var geeAssetId2                        = null
var fusionTableId                      = null
var fusionTableClassColumn             = null
var fusionTableClassColumnAutocomplete = null
var rowAlgorithms                      = null

var init = function (container) {
  form       = container.find('form')
  formNotify = form.find('.form-notify')
  
  name                   = form.find('input[name=name]')
  inputRecipe1           = form.find('input[name=input-recipe1]')
  inputRecipe2           = form.find('input[name=input-recipe2]')
  geeAssetId1            = form.find('input[name=gee-asset-id1]')
  geeAssetId2            = form.find('input[name=gee-asset-id2]')
  fusionTableId          = form.find('input[name=fusion-table-id]')
  fusionTableClassColumn = form.find('input[name=fusion-table-class-column]')
  rowAlgorithms          = form.find('.row-algorithm-btns')
  
  initEvents()
}

var initEvents = function () {
  name.change(function (e) {
    state.name = name.val()
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
  })
  fusionTableId.change(function (e) {
    state.fusionTableId = fusionTableId.val()
    updateFusionTableClass(state.fusionTableId)
  })
  
  var btns = rowAlgorithms.find('button')
  btns.click(function (e) {
    var btn = $(e.target)
    if (!btn.hasClass('active')) {
      e.preventDefault()
      btns.removeClass('active')
      btn.addClass('active')
      state.algorithm = btn.val()
    }
  })
  
  geeAssetId1.change(function () {
    state.geeAssetId1 = geeAssetId1.val()
    updateInputRecipe()
  })
  
  geeAssetId2.change(function () {
    state.geeAssetId2 = geeAssetId2.val()
    updateInputRecipe()
  })
  
  updateInputRecipe()
  
  form.submit(submit)
}

var submit = function (e) {
  e.preventDefault()
  
  FormValidator.resetFormErrors(form, formNotify)
  
  var valid    = true
  var errorMsg = ''
  
  if (!state.name || $.isEmptyString(state.name) || !/^[0-9A-Za-z][0-9A-Za-z\s_\-]+$/.test(state.name)) {
    valid    = false
    errorMsg = 'Please enter a valid name, only letters, numbers, _ or - are allowed'
    FormValidator.addError(name)
  } else if ($.isEmptyString(state.inputRecipe1) && $.isEmptyString(state.geeAssetId1)) {
    valid    = false
    errorMsg = 'Please select a valid source input recipe or Google Earth Engine asset id'
    FormValidator.addError(inputRecipe1)
  } else if ($.isEmptyString(state.inputRecipe2) && $.isEmptyString(state.geeAssetId2)) {
    valid    = false
    errorMsg = 'Please select a valid target input recipe or Google Earth Engine asset id'
    FormValidator.addError(inputRecipe2)
  } else if ($.isEmptyString(state.fusionTableId)) {
    valid    = false
    errorMsg = 'Please select a valid fusion table id'
    FormValidator.addError(fusionTableId)
  } else if ($.isEmptyString(state.fusionTableClassColumn)) {
    valid    = false
    errorMsg = 'Please select a valid fusion table class column'
    FormValidator.addError(fusionTableClassColumn)
  } else if (!state.algorithm) {
    valid    = false
    errorMsg = 'Please select a valid algorithm'
  }
  
  if (valid) {
    EventBus.dispatch(Events.SECTION.SEARCH.REQUEST_CHANGE_DETECTION, null, state)
  } else {
    FormValidator.showError(formNotify, errorMsg)
  }
  
}

// model change methods
var setState = function (e, newState, params) {
  FormValidator.resetFormErrors(form, formNotify)
  
  if (newState && newState.type == Model.TYPES.CHANGE_DETECTION && (!state || newState.id !== state.id)) {
    
    name.val(newState.name)
    
    var mosaic1 = mosaics.find(function (o) {
      return o.id == newState.inputRecipe1
    })
    mosaic1
      ? inputRecipe1.val(mosaic1.name).data('reset-btn').enable()
      : inputRecipe1Autocomplete.sepalAutocomplete('reset')
    restoreAoi(newState, params)
    
    var mosaic2 = mosaics.find(function (o) {
      return o.id == newState.inputRecipe2
    })
    mosaic2
      ? inputRecipe2.val(mosaic2.name).data('reset-btn').enable()
      : inputRecipe2Autocomplete.sepalAutocomplete('reset')
    
    if(state.geeAssetId1)
      geeAssetId1.val(state.geeAssetId1)
    if(state.geeAssetId2)
      geeAssetId2.val(state.geeAssetId2)
    
    fusionTableId.val(newState.fusionTableId)
    updateFusionTableClass(newState.fusionTableId)
    if (newState.fusionTableClassColumn)
      fusionTableClassColumn.val(newState.fusionTableClassColumn).data('reset-btn').enable()
    
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
  if (inputRecipe1Autocomplete)
    inputRecipe1Autocomplete.sepalAutocomplete('dispose')
  if (inputRecipe2Autocomplete)
    inputRecipe2Autocomplete.sepalAutocomplete('dispose')
  
  inputRecipe1Autocomplete = inputRecipe1.sepalAutocomplete({
    lookup  : mosaics.map(function (mosaic) {
      return {data: mosaic.id, value: mosaic.name}
    }),
    onChange: function (selection) {
      state.inputRecipe1 = selection ? selection.data : null
      
      state.aoiCode = null
      state.aoiName = null
      state.polygon = null
      state.geeAssetId1 = null
      geeAssetId1.val('')
      
      EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
      EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
      
      // load aoi
      if (state.inputRecipe1) {
        var params = {
          url         : '/processing-recipes/' + state.inputRecipe1
          , beforeSend: function () {
            // Loader.show()
          }
          , success   : function (response) {
            // Loader.hide({delay: 1000})
            
            var inputRecipeState = typeof response === 'string' ? JSON.parse(response) : response
            if (inputRecipeState.aoiCode) {
              state.aoiCode = inputRecipeState.aoiCode
              state.aoiName = inputRecipeState.aoiName
            } else {
              state.polygon = inputRecipeState.polygon
            }
            restoreAoi(state, {isNew: true})
          }
        }
        EventBus.dispatch(Events.AJAX.GET, null, params)
      }
      
    }
  })
  
  inputRecipe2Autocomplete = inputRecipe2.sepalAutocomplete({
    lookup  : mosaics.map(function (mosaic) {
      return {data: mosaic.id, value: mosaic.name}
    }),
    onChange: function (selection) {
      state.inputRecipe2 = selection ? selection.data : null
      
      state.geeAssetId2 = null
      geeAssetId2.val('')
    }
  })
}

var restoreAoi = function (s, params) {
  if (params && params.isNew) {
    
    if (s.aoiCode && s.aoiName) {
      EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
      EventBus.dispatch(Events.MAP.ZOOM_TO, null, s.aoiCode, true)
    } else if (s.polygon) {
      EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.RESTORE_DRAWN_AOI, null, s.polygon)
    }
  }
  
}

var updateFusionTableClass = function (ftId) {
  if (fusionTableClassColumnAutocomplete)
    fusionTableClassColumnAutocomplete.sepalAutocomplete('dispose')
  
  fusionTableClassColumn.disable()
  if (ftId) {
    var user     = UserMV.getCurrentUser()
    var keyParam = user.googleTokens ? 'access_token=' + user.googleTokens.accessToken : 'key=' + GoogleMapsLoader.KEY
    
    var params = {
      url     : 'https://www.googleapis.com/fusiontables/v2/tables/' + ftId + '/columns?' + keyParam,
      success : function (resp) {
        FormValidator.resetFormErrors(form)
        
        fusionTableClassColumnAutocomplete = fusionTableClassColumn.sepalAutocomplete({
          lookup  : resp.items.filter(function (item) {
            return item.type === 'NUMBER'
          }).map(function (item) {
            return {data: item.name, value: item.name}
          }),
          onChange: function (selection) {
            state.fusionTableClassColumn = selection ? selection.data : null
          }
        })
        
        fusionTableClassColumn.enable()
      }, error: function (xhr, ajaxOptions, thrownError) {
        FormValidator.addError(fusionTableId)
        FormValidator.showError(formNotify, xhr.responseJSON.error.message)
      }
      
    }
    EventBus.dispatch(Events.AJAX.GET, null, params)
  }
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.LIST_CHANGED, listMosaicsChanged)

module.exports.init = init