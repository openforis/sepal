/**
 * @author M. Togna
 */
require('./form-scenes-autoselection.scss')

var Model    = require('./../../../../search/model/search-model')
var EventBus = require('../../../../event/event-bus')
var Events   = require('../../../../event/events')

var noUiSlider = require('nouislider')
require('../../../../nouislider/nouislider.css')

var parentContainer = null
var template        = require('./form-scenes-autoselection.html')
var html            = $(template({}))

//UI elements
var sortSlider              = null
var offsetTargetDayBtnPlus  = null
var offsetTargetDayBtnMinus = null
var minScenesInput          = null
var maxScenesInput          = null
// form
var btnSubmit               = null
// form notify
var formNotify              = null

var state = {}

var init = function (parent) {
  parentContainer = parent
  var container   = parentContainer.find('.scenes-selection-filter')
  container.append(html)
  
  offsetTargetDayBtnPlus  = html.find('.offset-target-day-btn-plus')
  offsetTargetDayBtnMinus = html.find('.offset-target-day-btn-minus')
  
  minScenesInput = html.find('input[name=minScenes]')
  maxScenesInput = html.find('input[name=maxScenes]')
  
  formNotify = html.find('.form-notify')
  btnSubmit  = html.find('.btn-submit')
  
  //sort slider
  sortSlider = html.find('.sort-slider').get(0)
  if (!sortSlider.hasOwnProperty('noUiSlider')) {
    
    noUiSlider.create(sortSlider, {
      start: [0.5],
      step : 0.05,
      range: {
        'min': [0],
        'max': [1]
      }
    }, true)
    
    sortSlider.noUiSlider.on('change', function () {
      var sortWeight   = sortSlider.noUiSlider.get()
      state.sortWeight = sortWeight
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED)
    })
    
  }
  
  // target day
  offsetTargetDayBtnPlus.click(function (e) {
    state.offsetToTargetDay += 1
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED)
  })
  
  offsetTargetDayBtnMinus.click(function (e) {
    state.offsetToTargetDay -= 1
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED)
  })
  
  $.each(Model.getSensorGroups(), function (i, sensorGroup) {
    var row        = container.find('.row-sensor-' + sensorGroup)
    var rowSensors = row.find('.sensors')
    var Sensors    = Model.getSensors(sensorGroup)
    $.each(Object.keys(Sensors), function (j, sensorId) {
      var sensor = Sensors[sensorId]
      
      var btn = $('<button class="btn btn-base btn-sensor round">' + sensor.shortName + '</button>')
      btn.addClass(sensorId)
      
      btn.click(function (e) {
        e.preventDefault()
        // var evt = null
        if (btn.hasClass('active')) {
          state.sensors.splice(state.sensors.indexOf(sensorId), 1)
        } else {
          state.sensors.push(sensorId)
        }
        
        EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
        EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED)
      })
      
      rowSensors.append(btn)
    })
  })
  
  // number of scenes
  minScenesInput.change(function (e) {
    state.minScenes = minScenesInput.val()
    // EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.MIN_SCENES_CHANGE, null, minScenesInput.val() )
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, null, state)
  })
  
  maxScenesInput.change(function (e) {
    state.maxScenes = maxScenesInput.val()
    // EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.MAX_SCENES_CHANGE, null, maxScenesInput.val() )
    EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, null, state)
  })
  
  // submit form
  btnSubmit.click(function (e) {
    e.preventDefault()
    formNotify.empty().velocitySlideUp({delay: 0, duration: 100})
    
    if (state.sensors.length <= 0) {
      formNotify.html('At least one sensor must be selected').velocitySlideDown({delay: 20, duration: 400})
    } else if (state.maxScenes && state.minScenes > state.maxScenes) {
      formNotify.html('Min number of scenes cannot be greater than Max number of scenes').velocitySlideDown({delay: 20, duration: 400})
    } else {
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.BEST_SCENES, null, state)
    }
  })
  
  // reset()
}

var reset = function () {
  formNotify.empty()
  formNotify.velocitySlideUp({delay: 0, duration: 0})
}

var setActiveState = function (e, activeState) {
  state = activeState
  reset()
  if (state && state.type=== Model.TYPES.MOSAIC) {
    
    setSortWeight(state.sortWeight)
    setOffsetToTargetDay(state.offsetToTargetDay)
    
    parentContainer.find('.row-sensor').hide()
    parentContainer.find('.row-sensor-' + state.sensorGroup).show()
    setSensors(state.sensorGroup, state.sensors)
    
    minScenesInput.val(state.minScenes)
    maxScenesInput.val(state.maxScenes)
  }
  
}
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

var setSensors = function (sensorGroup, sensors) {
  var row        = parentContainer.find('.row-sensor-' + sensorGroup)
  var rowSensors = row.find('.sensors')
  
  var Sensors = Model.getSensors(sensorGroup)
  $.each(Object.keys(Sensors), function (j, sensorId) {
    var btn = rowSensors.find('.' + sensorId)
    if (sensors.indexOf(sensorId) >= 0)
      btn.addClass('active')
    else
      btn.removeClass('active')
  })
}

var setOffsetToTargetDay = function (value) {
  offsetTargetDayBtnMinus.prop('disabled', (value <= 0))
  
  var textValue = ''
  if (value == 0) {
    textValue = state.targetDate.substr(0, 4)
  } else {
    textValue = value + ' year'
    textValue += ( value > 1 ) ? 's' : ''
  }
  
  html.find('.offset-target-day').html(textValue)
}

var setSortWeight = function (sortWeight) {
  sortSlider.noUiSlider.set(sortWeight)
  
  html.find('.cc-sort').html(Math.round(+((1 - sortWeight).toFixed(2)) * 100) + '%')
  html.find('.td-sort').html(Math.round(sortWeight * 100) + '%')
}

var hide = function (options) {
  parentContainer.velocitySlideUp(options)
}

// var firstShow        = false
var toggleVisibility = function (options) {
  parentContainer.velocitySlideToggle(options)
}

module.exports = {
  init                  : init
  , setActiveState      : setActiveState
  , reset               : reset
  , setSortWeight       : setSortWeight
  , setOffsetToTargetDay: setOffsetToTargetDay
  , hide                : hide
  , toggleVisibility    : toggleVisibility
  
}