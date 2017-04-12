/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var SearchParams  = require( '../search-params' )
var FormValidator = require( '../../form/form-validator' )
var DatePicker    = require( '../../date-picker/date-picker' )
var SepalAois     = require( '../../sepal-aois/sepal-aois' )
var moment        = require( 'moment' )

var form       = null
var formNotify = null

var fieldCountry   = null
var btnDrawPolygon = null
var btnLandsat     = null
var btnSentinel2   = null
var targetDate     = null
// var sectionLandsatSensors   = null
// var sectionSentinel2Sensors = null

var init = function ( formSelector ) {
    SearchParams.reset()
    
    form       = $( formSelector )
    formNotify = form.find( '.form-notify' )
    
    fieldCountry = form.find( '#search-form-country' )
    SepalAois.loadAoiList( function ( aois ) {
        fieldCountry.sepalAutocomplete( {
            lookup    : aois
            , onChange: function ( selection ) {
                if ( selection ) {
                    var cCode = selection.data
                    var cName = selection.value
                    
                    EventBus.dispatch( Events.MAP.POLYGON_CLEAR )
                    EventBus.dispatch( Events.MAP.ZOOM_TO, null, cCode )
                    
                    setCountryIso( cCode )
                    
                    FormValidator.resetFormErrors( form, formNotify )
                } else {
                    EventBus.dispatch( Events.MAP.REMOVE_AOI_LAYER )
                    setCountryIso( null )
                }
            }
        } )
    } )
    
    btnDrawPolygon = form.find( '.btn-draw-polygon' )
    btnDrawPolygon.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.REDUCE )
        EventBus.dispatch( Events.MAP.POLYGON_CLEAR )
        EventBus.dispatch( Events.MAP.POLYGON_DRAW )
    } )
    
    btnLandsat            = form.find( '.btn-landsat' )
    btnSentinel2          = form.find( '.btn-sentinel2' )
    var changeSensorGroup = function ( domEvt, btn, evt ) {
        domEvt.preventDefault()
        if ( !btn.hasClass( 'active' ) ) {
            EventBus.dispatch( evt )
        }
    }
    btnLandsat.click( function ( e ) {
        changeSensorGroup( e, btnLandsat, Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_LANDSAT_SENSOR_GROUP )
    } )
    btnSentinel2.click( function ( e ) {
        changeSensorGroup( e, btnSentinel2, Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_SENTINEL2_SENSOR_GROUP )
    } )
    
    targetDate              = DatePicker.newInstance( form.find( '.target-date' ) )
    SearchParams.targetDate = targetDate
    
    var now = moment( new Date() )
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
    var date     = targetDate.asMoment()
    
    
    if ( !SearchParams.hasValidAoi() ) {
        valid    = false
        errorMsg = 'Please select a valid COUNTRY or DRAW A POLYGON'
        
        FormValidator.addError( fieldCountry )
    }
    // else if ( SearchParams.landsatSensors.length <= 0 && SearchParams.sentinel2Sensors.length <= 0 ) {
    //     valid    = false
    //     errorMsg = 'Please select either LANDSAT or SENTINEL-2 sensors'
    // } else if ( SearchParams.landsatSensors.length > 0 && SearchParams.sentinel2Sensors.length > 0 ) {
    //     valid    = false
    //     errorMsg = 'Only sensors within LANDSAT or SENTINEL-2 can be selected'
    // }
    else if ( !date.isValid() ) {
        valid    = false
        errorMsg = 'Please select a valid TARGET DATE'
    } else if ( date.isAfter( moment() ) ) {
        valid    = false
        errorMsg = 'TARGET DATE cannot be later than today'
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
    setPolygon( polygon )
    
    btnDrawPolygon.addClass( 'active' )
    
    fieldCountry.sepalAutocomplete( 'reset' )
}

var polygonClear = function ( e ) {
    setPolygon( null )
    btnDrawPolygon.removeClass( 'active' )
}

var setCountryIso = function ( c ) {
    SearchParams.countryIso = c
    SearchParams.polygon    = null
}

var setPolygon = function ( p ) {
    SearchParams.polygon    = p
    SearchParams.countryIso = null
}

// model change methods
var setSensorGroup = function ( sensorGroup ) {
    if ( SearchParams.SENSORS.LANDSAT == sensorGroup ) {
        btnLandsat.addClass( 'active' )
        btnSentinel2.removeClass( 'active' )
    } else if ( SearchParams.SENSORS.SENTINEL2 == sensorGroup ) {
        btnLandsat.removeClass( 'active' )
        btnSentinel2.addClass( 'active' )
    }
}

module.exports = {
    init            : init
    , find          : find
    , setSensorGroup: setSensorGroup
}

EventBus.addEventListener( Events.MAP.POLYGON_DRAWN, polygonDrawn )
EventBus.addEventListener( Events.MAP.POLYGON_CLEAR, polygonClear )