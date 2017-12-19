/**
 * @author Mino Togna
 */
require('./form-mosaic-retrieve.scss')
var R = require('ramda')

var EventBus      = require('../../../../event/event-bus')
var Events        = require('../../../../event/events')
var FormValidator = require('../../../../form/form-validator')
var BudgetCheck   = require('../../../../budget-check/budget-check')
var SModel        = require('./../../../../search/model/search-model')
var UserMV        = require('../../../../user/user-mv')
var Sensors       = require('../../../../search/model/sensors')

var parentContainer = null
var container       = null
var template        = require('./form-mosaic-retrieve.html')
var html            = $(template({}))

var state = {}

var rowLandsat    = null
var rowSentinel2  = null
var form          = null
var formNotify    = null
var activeSection = null

var SensorsMapping = [
  {sensorId: 'LC8', sensorGroup: 'LANDSAT_8'},
  {sensorId: 'LE7', sensorGroup: 'LANDSAT_7'},
  {sensorId: 'LT5', sensorGroup: 'LANDSAT_TM'},
  {sensorId: 'LT4', sensorGroup: 'LANDSAT_TM'}
]

var init = function (parent) {
  parentContainer = parent
  container       = parentContainer.find('.mosaic-retrieve')
  container.append(html)
  
  rowLandsat   = html.find('.row-LANDSAT')
  rowSentinel2 = html.find('.row-SENTINEL2')
  form         = html.find('form')
  formNotify   = html.find('.form-notify')
  
  container.find('.btn-band').click(function (e) {
    e.preventDefault()
    $(this).toggleClass('active')
  })
  
  container.find('.btn-submit').click(function (e) {
    e.preventDefault()
    submit(activeSection, $(e.target).data('destination'))
  })
  
  if (UserMV.getCurrentUser().googleTokens)
    $('.google-account-dependent').show()
  else
    $('.google-account-dependent').hide()
}

var submit = function (section, destination) {
  FormValidator.resetFormErrors(form)
  
  var name  = section.find('input[name=name]')
  var valid = FormValidator.validateForm(form, name)
  
  if (valid) {
    if (!/^[0-9A-Za-z][0-9A-Za-z\s_\-]+$/.test(name.val())) {
      valid = false
      FormValidator.addError(name)
      FormValidator.showError(formNotify, 'Name can contain only letters, numbers, _ or -')
    }
  }
  
  if (valid) {
    var bands = getBands(section)
    
    if (bands.length <= 0)
      FormValidator.showError(formNotify, 'At least one band must be selected')
    else
      EventBus.dispatch(Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_MOSAIC, null, state, {bands: bands.join(','), name: name.val(), destination: destination})
    
  }
  
}

var getBands = function (section) {
  var bands = []
  section.find('.btn-band.active').each(function () {
    var value = $(this).val()
    bands.push(value)
  })
  return bands
}

var hide = function (options) {
  parentContainer.velocitySlideUp(options)
}

var toggleVisibility = function (options) {
  options = $.extend({}, {
    begin: function (elements) {
      BudgetCheck.check(html)
    }
  }, options)
  parentContainer.velocitySlideToggle(options)
}

var reset = function () {
  FormValidator.resetFormErrors(form)
  
  form.find('.btn-band').removeClass('active')
  form.find('input').val('')
}

var getUniqueBands = function () {
  var bands = R.pipe(
    R.prop('sceneAreas'),
    R.mapObjIndexed(function (sceneArea, sceneAreaId) {
      // console.log(sceneAreaId, sceneArea.selection)
      return sceneArea.selection
    }),
    R.values,
    R.flatten,
    R.map(function (sceneId) {
      return sceneId.substring(0, 3)
    }),
    R.uniq,
    R.map(function (prefix) {
      return R.pipe(
        R.find(R.propEq('sensorId', prefix)),
        R.defaultTo({sensorGroup: 'SENTINEL2A'}),
        R.prop('sensorGroup')
      )(SensorsMapping)
    }),
    R.map(function (sensorGroup) {
      var sensorObj = (Sensors.LANDSAT[sensorGroup]) ? Sensors.LANDSAT[sensorGroup] : Sensors.SENTINEL2[sensorGroup]
      return sensorObj.bands
    }),
    R.values,
    R.flatten,
    R.uniq
  )(state)
  
  return bands
}

var setActiveState = function (e, activeState) {
  state = activeState
  if (state && state.type == SModel.TYPES.MOSAIC) {
    
    html.find('.row-sensors').hide()
    if (state.sensorGroup) {
      activeSection = html.find('.row-' + state.sensorGroup).show()
    }
    var inputs = form.find('input')
    $.each(inputs, function (i, input) {
      input = $(input)
      // if ($.isEmptyString(input.val())) {
      input.val(state.name)
      // }
    })
    
    if (state.median) {
      disableDateBands()
    } else {
      enableDateBands()
    }
  }
  
  var bands = getUniqueBands()
  container.find('.btn-band').each(function () {
    var btn = $(this)
    console.log(" -- " , btn.val())
    if (R.contains(btn.val(), bands)) {
      btn.enable()
    } else {
      btn.disable()
      $(this).removeClass('active')
    }
  })
}

var disableDateBands = function () {
  $(container.find('.row-date-bands button')).each(function (i, btn) {
    $(btn).removeClass('active').disable()
  })
}

var enableDateBands = function () {
  $(container.find('.row-date-bands button')).each(function (i, btn) {
    $(btn).enable()
  })
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setActiveState)

module.exports = {
  init              : init
  , hide            : hide
  , toggleVisibility: toggleVisibility
  , reset           : reset
  , disableDateBands: disableDateBands
  , enableDateBands : enableDateBands
}