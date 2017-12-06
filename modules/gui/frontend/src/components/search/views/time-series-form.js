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
    state.aoi = {
      type:'polygon',
      path:jsonPolygon
    }
    drawPoligonBtn.addClass('active')
    
    aoiInput.sepalAutocomplete('reset')
    fusionTableId.val('')
  }
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)
EventBus.addEventListener(Events.MAP.POLYGON_DRAWN, polygonDrawn)

module.exports.init = init