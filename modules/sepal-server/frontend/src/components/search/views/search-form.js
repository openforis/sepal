/**
 * @author Mino Togna
 */

var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var SearchParams  = require( '../search-params' )
var FormValidator = require( '../../form/form-validator' )
var DatePicker    = require( '../../date-picker/date-picker' )
var countries     = require( './../data/countries.js' )
var moment        = require( 'moment' )

require( 'devbridge-autocomplete' )

// form ui components
var form           = null
var formNotify     = null
//
var fieldCountry   = null
// var countryCode    = null
var btnDrawPolygon = null
// var polygonAoi     = null
var targetDate     = null

var init = function ( formSelector ) {
    SearchParams.init()
    
    // countryIso = null
    form       = $( formSelector )
    formNotify = form.find( '.form-notify' )
    
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
                
                // countryCode = cCode
                SearchParams.setCountryIso( countryCode )
                EventBus.dispatch( Events.MAP.ZOOM_TO, null, cName )
                EventBus.dispatch( Events.MAP.POLYGON_CLEAR )
            }
        }, onInvalidateSelection   : function () {
            SearchParams.setCountryIso( null )
        }
    } )
    
    btnDrawPolygon = form.find( '.btn-draw-polygon' )
    btnDrawPolygon.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.REDUCE )
        EventBus.dispatch( Events.MAP.POLYGON_CLEAR )
        EventBus.dispatch( Events.MAP.POLYGON_DRAW )
    } )
    
    targetDate = DatePicker.newInstance( form.find( '.target-date' ) )
    SearchParams.setTargetDate( targetDate )
    
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
    if ( !SearchParams.hasValidAoi() ) {
        valid    = false
        errorMsg = 'Please select a valid COUNTRY or DRAW A POLYGON'
        
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

var polygonDrawn = function ( e, polygon ) {
    SearchParams.setPolygon( polygon )
    
    btnDrawPolygon.addClass( 'active' )
    
    fieldCountry.val( null )
}

var polygonClear = function ( e ) {
    SearchParams.setPolygon( null )
    btnDrawPolygon.removeClass( 'active' )
}

module.exports = {
    init         : init
    // , params : function (  ) {
    //     return SearchParams
    // }
    // , countryCode: function () {
    //     return countryIso
    // }
    // , targetDate : function () {
    //     return targetDate
    // }
    , find       : find
}

EventBus.addEventListener( Events.MAP.POLYGON_DRAWN, polygonDrawn )
EventBus.addEventListener( Events.MAP.POLYGON_CLEAR, polygonClear )