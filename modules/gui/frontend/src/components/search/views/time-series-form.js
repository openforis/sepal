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

var form = null

var init = function (container) {
  console.log(container)
}

module.exports.init = init