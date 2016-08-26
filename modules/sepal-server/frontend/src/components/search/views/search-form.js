/**
 * @author Mino Togna
 */

var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form/form-validator' )
var DatePicker    = require( '../../date-picker/date-picker' )
var countries     = require( './../data/countries.js' )
var moment        = require( 'moment' )

require( 'devbridge-autocomplete' )

// form ui components
var form         = null
var formNotify   = null
//
var fieldCountry = null
var countryCode  = null
var targetDate   = null

var init = function ( formSelector ) {
    countryCode = null
    form        = $( formSelector )
    formNotify  = form.find( '.form-notify' )
    
    fieldCountry = form.find( '#search-form-country' )
    fieldCountry.autocomplete( {
        lookup                     : countries
        , minChars                 : 0
        , autoSelectFirst          : true
        , triggerSelectOnValidInput: false
        , tabDisabled              : true
        , onSelect                 : function ( selection ) {
            if ( selection ) {
                var cCode = selection.data
                var cName = selection.value
                
                countryCode = cCode
                EventBus.dispatch( Events.MAP.ZOOM_TO, null, cName )
            }
        }, onInvalidateSelection   : function () {
            countryCode = null
        }
    } )
    
    targetDate = DatePicker.newInstance( form.find( '.target-date' ) )
    var now    = moment( new Date() )
    setTimeout( function () {
        targetDate.select( 'year', now.format( 'YYYY' ) )
        targetDate.select( 'month', now.format( 'MM' ) )
        targetDate.select( 'day', now.format( 'DD' ) )
    }, 1000 )
    
    form.submit( submit )
    
}

var submit = function ( e ) {
    e.preventDefault()
    
    FormValidator.resetFormErrors( form, formNotify )
    
    var valid    = true
    var errorMsg = ''
    if ( $.isEmptyString( countryCode ) ) {
        valid    = false
        errorMsg = 'Please select a valid COUNTRY'
        
        FormValidator.addError( fieldCountry )
    } else if ( !targetDate.asMoment().isValid() ) {
        valid    = false
        errorMsg = 'Please select a valid TARGET DATE'
    }
    
    if ( valid ) {
        EventBus.dispatch( Events.SECTION.SEARCH.FORM_SUBMIT, null )
    } else {
        FormValidator.showError( formNotify, errorMsg )
    }
    
}

var find = function ( selector ) {
    return form.find( selector )
}

module.exports = {
    init         : init
    , countryCode: function () {
        return countryCode
    }
    , targetDate : function () {
        return targetDate
    }
    , find       : find
}