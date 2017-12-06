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

var description     = null
var aoiInput        = null
var aoiAutoComplete = null
var drawPoligonBtn  = null
var fusionTableId   = null
var dataSets        = null
var fromDate        = null
var fromDateLabel   = null
var toDate          = null
var toDateLabel     = null
var indicator       = null
var otherOptions    = null

var init = function (container) {
  form       = container.find('form')
  formNotify = form.find('.form-notify')
  
  aoiInput       = form.find('[name=sepal-aoi]')
  drawPoligonBtn = form.find('.btn-draw-polygon')
  fusionTableId  = form.find('[name=fusion-table-id]')
  description    = form.find('[name=description]')
  dataSets       = form.find('.row-sensor')
  fromDate       = DatePicker.newInstance(form.find('.from-date')).hide()
  fromDateLabel  = form.find('.from-date-label')
  toDate         = DatePicker.newInstance(form.find('.to-date')).hide()
  toDateLabel    = form.find('.to-date-label')
  indicator      = form.find('.row-indicator')
  otherOptions   = form.find('.row-other-options')
  
  initEventHandlers()
}

var initEventHandlers = function () {
  description.change(function (e) {
    state.description = description.val()
    
    if ($.isNotEmptyString(state.description))
      FormValidator.removeError(description)
  })
  
  SepalAois.loadAoiList(function (aois) {
    aoiAutoComplete = aoiInput.sepalAutocomplete({
      lookup    : aois
      , onChange: function (selection) {
        if (selection) {
          setCountryIso(selection.data, selection.value, true)
        } else {
          setCountryIso(null, null)
        }
      }
    })
  })
  
  fusionTableId.change(function (e) {
    if ($.isNotEmptyString(fusionTableId.val())) {
      FormValidator.removeError(aoiInput)
      
      aoiInput.sepalAutocomplete('reset')
      drawPoligonBtn.removeClass('active')
      EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
      EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
      
      state.aoi = {
        type     : 'fusionTableCollection',
        tableName: fusionTableId.val()
      }
    }
  })
  
  drawPoligonBtn.click(function (e) {
    e.preventDefault()
    EventBus.dispatch(Events.SECTION.REDUCE)
    EventBus.dispatch(Events.MAP.POLYGON_DRAW)
  })
  
  dataSets.find('button').click(function (e) {
    var btn = $(e.target)
    btn.toggleClass('active')
    if (btn.hasClass('active')){
      state.dataSets.push(btn.val())
      FormValidator.removeError(dataSets)
    }
    else
      state.dataSets.splice(state.dataSets.indexOf(btn.val()), 1)
  })
  
  fromDate.onChange = function (year, month, day) {
    FormValidator.removeError(fromDateLabel)
    FormValidator.removeError(toDateLabel)
    
    state.fromDate = year + '-' + month + '-' + day
  }
  fromDateLabel.click(function (e) {
    fromDate.toggle()
  })
  
  toDate.onChange = function (year, month, day) {
    FormValidator.removeError(toDateLabel)
    FormValidator.removeError(fromDateLabel)
    
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
      FormValidator.removeError(indicator)
      
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
  
  var valid          = true
  var errorMsg       = ''
  var fromDateMoment = fromDate.asMoment()
  var toDateMoment   = toDate.asMoment()
  
  if (!state.description || $.isEmptyString(state.description) || !/^[0-9A-Za-z][0-9A-Za-z\s_\-]+$/.test(state.description)) {
    valid    = false
    errorMsg = 'Please enter a valid name, only letters, numbers, _ or - are allowed'
    
    FormValidator.addError(description)
  } else if (!state.aoi) {
    valid    = false
    errorMsg = 'Please select a valid AREA OF INTEREST'
    
    FormValidator.addError(aoiInput)
  } else if (state.dataSets.length === 0) {
    valid    = false
    errorMsg = 'Please select at least one SENSOR'
    
    FormValidator.addError(dataSets)
  } else if (!fromDateMoment.isValid()) {
    valid    = false
    errorMsg = 'Please select a valid FROM DATE'
    
    FormValidator.addError(fromDateLabel)
  } else if (!toDateMoment.isValid()) {
    valid    = false
    errorMsg = 'Please select a valid TO DATE'
    
    FormValidator.addError(toDateLabel)
  } else if (fromDateMoment.isAfter(toDateMoment)) {
    valid    = false
    errorMsg = 'FROM DATE cannot be later than TO DATE'
    
    FormValidator.addError(fromDateLabel)
    FormValidator.addError(toDateLabel)
  } else if (!state.indicator || $.isEmptyString(state.indicator)) {
    valid    = false
    errorMsg = 'Please select one indicator'
    
    FormValidator.addError(indicator)
  }
  
  if (valid) {
    EventBus.dispatch(Events.SECTION.SEARCH.REQUEST_TIME_SERIES, null, state)
  } else {
    FormValidator.showError(formNotify, errorMsg)
  }
  
}

// model change methods. now only adding time series is allowed (not editing)
var setState = function (e, newState, params) {
  FormValidator.resetFormErrors(form, formNotify)
  state = newState
  
  if (state && state.type == Model.TYPES.TIME_SERIES) {
    description.val(state.description)
    
    var date               = moment(state.fromDate)
    fromDate.triggerChange = false
    fromDate.select('year', date.format('YYYY'))
    fromDate.select('month', date.format('MM'))
    fromDate.select('day', date.format('DD'))
    fromDate.triggerChange = true
    
    date                 = moment(state.toDate)
    toDate.triggerChange = false
    toDate.select('year', date.format('YYYY'))
    toDate.select('month', date.format('MM'))
    toDate.select('day', date.format('DD'))
    toDate.triggerChange = true
    
    // reset other values
    aoiInput.sepalAutocomplete('reset')
    drawPoligonBtn.removeClass('active')
    fusionTableId.val('')
    EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
    EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
    
    dataSets.find('button').removeClass('active')
    otherOptions.find('button').removeClass('active')
    indicator.find('button').removeClass('active')
  }
}

var setCountryIso = function (code, name, zoom) {
  
  if (code) {
    FormValidator.removeError(aoiInput)
    
    state.aoi = {
      type     : 'fusionTable',
      tableName: SepalAois.getTableName(),
      keyColumn: SepalAois.getKeyColumn(),
      keyValue : code
    }
    
    EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
    EventBus.dispatch(Events.MAP.ZOOM_TO, null, code, zoom)
    
    drawPoligonBtn.removeClass('active')
    fusionTableId.val('')
    
  } else {
    state.aoi = null
    EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
  }
}

var polygonDrawn = function (e, jsonPolygon, polygon) {
  if (state && state.type == Model.TYPES.TIME_SERIES) {
    FormValidator.removeError(aoiInput)
    
    state.aoi = {
      type: 'polygon',
      path: jsonPolygon
    }
    drawPoligonBtn.addClass('active')
    
    aoiInput.sepalAutocomplete('reset')
    fusionTableId.val('')
  }
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)
EventBus.addEventListener(Events.MAP.POLYGON_DRAWN, polygonDrawn)

module.exports.init = init