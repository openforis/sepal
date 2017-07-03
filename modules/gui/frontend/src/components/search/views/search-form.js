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

var form                = null
var formNotify          = null
var inputName           = null
var inputAoiCode        = null
var autocompleteAoiCode = null
var btnDrawPolygon      = null
var btnLandsat          = null
var btnSentinel2        = null
var targetDate          = null

var state = {}

var init = function (formSelector) {
  form       = $(formSelector)
  formNotify = form.find('.form-notify')
  
  inputName = form.find('[name=name]')
  inputName.change(function (e) {
    state.name = inputName.val()
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {field: 'name'})
  })
  
  inputAoiCode = form.find('#search-form-country')
  SepalAois.loadAoiList(function (aois) {
    autocompleteAoiCode = inputAoiCode.sepalAutocomplete({
      lookup    : aois
      , onChange: function (selection) {
        if (selection) {
          FormValidator.resetFormErrors(form, formNotify)
          
          setCountryIso(selection.data, selection.value, true)
        } else {
          setCountryIso(null, null)
        }
        EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
      }
    })
    
    btnDrawPolygon = form.find('.btn-draw-polygon')
    btnDrawPolygon.click(function (e) {
      e.preventDefault()
      EventBus.dispatch(Events.SECTION.REDUCE)
      // EventBus.dispatch( Events.MAP.POLYGON_CLEAR )
      EventBus.dispatch(Events.MAP.POLYGON_DRAW)
    })
    
    btnLandsat            = form.find('.btn-landsat')
    btnSentinel2          = form.find('.btn-sentinel2')
    var changeSensorGroup = function (e, btn) {
      e.preventDefault()
      if (!btn.hasClass('active')) {
        var value         = btn.val()
        state.sensorGroup = value
        state.sensors     = Object.keys(Model.getSensors(state.sensorGroup))
        
        setSensorGroupState(state.sensorGroup)
        EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
      }
    }
    btnLandsat.click(function (e) {
      changeSensorGroup(e, btnLandsat)
    })
    btnSentinel2.click(function (e) {
      changeSensorGroup(e, btnSentinel2)
    })
    
    targetDate          = DatePicker.newInstance(form.find('.target-date'))
    targetDate.onChange = function (year, month, day) {
      state.targetDate = year + '-' + month + '-' + day
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
    }
    
    form.submit(submit)
    
  })
}

var submit = function (e) {
  e.preventDefault()
  
  FormValidator.resetFormErrors(form, formNotify)
  
  var valid    = true
  var errorMsg = ''
  var date     = targetDate.asMoment()
  
  // console.log('======= name : ', state.name)
  if (!state.name || state.name.indexOf(' ') >= 0) {
    valid    = false
    errorMsg = 'Please enter a valid name, no whitespace are allowed'
    
    FormValidator.addError(inputName)
    // } else if (Model.containsMosaicName(state)) {
    //   valid    = false
    //   errorMsg = 'Name already exists. Please enter a unique name'
    //
    //   FormValidator.addError(inputName)
  } else if ($.isEmptyString(state.aoiCode) && $.isEmptyString(state.polygon)) {
    valid    = false
    errorMsg = 'Please select a valid COUNTRY or DRAW A POLYGON'
    
    FormValidator.addError(inputAoiCode)
  } else if (!date.isValid()) {
    valid    = false
    errorMsg = 'Please select a valid TARGET DATE'
  } else if (date.isAfter(moment())) {
    valid    = false
    errorMsg = 'TARGET DATE cannot be later than today'
  }
  
  if (valid) {
    EventBus.dispatch(Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, null, state)
  } else {
    FormValidator.showError(formNotify, errorMsg)
  }
  
}

var find = function (selector) {
  return form.find(selector)
}

var polygonDrawn = function (e, jsonPolygon, polygon) {
  setPolygon(jsonPolygon)
  // setPolygon(JSON.stringify(jsonPolygon))
  btnDrawPolygon.addClass('active')
  
  inputAoiCode.sepalAutocomplete('reset')
  
  EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
}

var polygonClear = function (e) {
  setPolygon(null)
  btnDrawPolygon.removeClass('active')
}

var setCountryIso = function (code, name, zoom) {
  
  state.aoiCode = code
  state.aoiName = name
  
  if (code) {
    EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
    EventBus.dispatch(Events.MAP.ZOOM_TO, null, state.aoiCode, zoom)
    
    state.polygon = null
  } else {
    EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
  }
}

var setPolygon = function (p) {
  if (state) {
    state.polygon = p
    if (p) {
      state.aoiCode = null
      state.aoiName = null
    }
  }
}

// model change methods
var setState = function (e, newState, params) {
  FormValidator.resetFormErrors(form, formNotify)
  state = newState
  
  if (state && state.type == Model.TYPES.MOSAIC) {
    
    if (!params || params.field !== 'name')
      inputName.val(state.name)
    
    if (state.aoiCode && state.aoiName) {
      inputAoiCode.val(state.aoiName).data('reset-btn').enable()
      
      setCountryIso(state.aoiCode, state.aoiName)
    } else {
      inputAoiCode.sepalAutocomplete('reset')
      setCountryIso(null, null)
    }
    
    if (state.polygon) {
      inputAoiCode.sepalAutocomplete('reset')
      setPolygon(state.polygon)
      btnDrawPolygon.addClass('active')
      
      if (params && params.isNew)
        EventBus.dispatch(Events.SECTION.SEARCH.STATE.RESTORE_DRAWN_AOI, null, state.polygon)
    } else {
      btnDrawPolygon.removeClass('active')
    }
    
    var date = moment(state.targetDate)
    setTimeout(function () {
      targetDate.triggerChange = false
      targetDate.select('year', date.format('YYYY'))
      targetDate.select('month', date.format('MM'))
      targetDate.select('day', date.format('DD'))
      targetDate.triggerChange = true
    }, 400)
    
    setSensorGroupState(state.sensorGroup)
  } else {
    EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
    EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
  }
}
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)

var setSensorGroupState = function (sensorGroup) {
  form.find('.btn-sensor-group').removeClass('active')
  form.find('.btn-sensor-group[value=' + sensorGroup + ']').addClass('active')
}

module.exports = {
  init  : init
  , find: find
  
}

EventBus.addEventListener(Events.MAP.POLYGON_DRAWN, polygonDrawn)
EventBus.addEventListener(Events.MAP.POLYGON_CLEAR, polygonClear)