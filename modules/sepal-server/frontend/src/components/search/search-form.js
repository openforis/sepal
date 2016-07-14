/**
 * @author Mino Togna
 */

var EventBus   = require( '../event/event-bus' )
var Events     = require( '../event/events' )
var Animation  = require( '../animation/animation' )
var DatePicker = require( '../date-picker/date-picker' )
var countries  = require( './countries.js' )
var moment     = require( 'moment' )

require( 'devbridge-autocomplete' )

// form ui components
var form        = null
var formNotify  = null
//
var countryCode = null
var targetDate  = null

var init = function ( formSelector ) {

    form       = $( formSelector )
    formNotify = form.find( '.form-notify' )
    
    var country = form.find( '#search-form-country' )
    country.autocomplete( {
        lookup           : countries
        , minChars       : 0
        , autoSelectFirst: true
        , onSelect       : function ( selection ) {
            if ( selection ) {
                var cCode = selection.data
                var cName = selection.value
                
                countryCode = cCode
                EventBus.dispatch( Events.MAP.ZOOM_TO, null, cName )
            }
        }
        , tabDisabled    : true
    } )
    
    targetDate = DatePicker.newInstance( form.find( '.target-date' ) )
    var now    = moment( new Date() )
    setTimeout( function () {
        targetDate.select( 'year', now.format( 'YYYY' ) )
        targetDate.select( 'month', now.format( 'MM' ) )
        targetDate.select( 'day', now.format( 'DD' ) )
    }, 1000 )
    
    bindEvents()
    
}

var bindEvents = function () {
    
    form.submit( function ( e ) {
            e.preventDefault()
            
            var valid = true
            if ( $.trim( countryCode ) == '' ) {
                formNotify.html( 'Please select a valid COUNTRY' )
                valid = false
            }
            else if ( !targetDate.asMoment().isValid() ) {
                // targetDate.year <= 0 || targetDate.month <= 0 || targetDate.day <= 0 
                formNotify.html( 'Please select a valid TARGET DATE' )
                valid = false
            }
            // for debugging
            // TODO : REMOVE_TASK
            valid = true
            if ( valid ) {
                Animation.animateOut( formNotify )
                formNotify.html( '' )
                
                EventBus.dispatch( Events.SECTION.SEARCH.FORM_SUBMIT, null )
            } else {
                Animation.animateIn( formNotify )
            }
            
        }
    )
    
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