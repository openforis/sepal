/**
 * @author M. Togna
 */
require( './scenes-autoselection-form.scss' )

var SearchParams = require( './../../../search/search-params' )
// var Filter       = require( '../../../scenes-selection/views/scenes-selection-filter/scenes-selection-filter-m' )

var EventBus = require( '../../../event/event-bus' )
var Events   = require( '../../../event/events' )
var Sensors  = require( '../../../sensors/sensors' )

var noUiSlider = require( 'nouislider' )
require( '../../../nouislider/nouislider.css' )

var parentContainer = null
var template        = require( './scenes-autoselection-form.html' )
var html            = $( template( {} ) )

//UI elements
var sortSlider              = null
var sectionSensors          = null
var offsetTargetDayBtnPlus  = null
var offsetTargetDayBtnMinus = null
// form
var btnSubmit               = null
// form notify
var formNotify              = null

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.scenes-selection-filter' )
    container.append( html )
    
    sectionSensors          = html.find( '.sensors' )
    offsetTargetDayBtnPlus  = html.find( '.offset-target-day-btn-plus' )
    offsetTargetDayBtnMinus = html.find( '.offset-target-day-btn-minus' )
    
    formNotify = html.find( '.form-notify' )
    btnSubmit  = html.find( '.btn-submit' )
    
    //sort slider
    sortSlider = html.find( '.sort-slider' ).get( 0 )
    if ( !sortSlider.hasOwnProperty( 'noUiSlider' ) ) {
        
        noUiSlider.create( sortSlider, {
            start: [ 0.5 ],
            step : 0.05,
            range: {
                'min': [ 0 ],
                'max': [ 1 ]
            }
        }, true )
        
        sortSlider.noUiSlider.on( 'change', function () {
            var sortWeight = sortSlider.noUiSlider.get()
            setSortWeight( sortWeight )
            // EventBus.dispatch( Events.SECTION.SCENES_SELECTION.SORT_CHANGE, null, sortWeight )
            EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.WEIGHT_CHANGE, null, sortWeight )
        } )
        
    }
    
    // target day
    offsetTargetDayBtnPlus.click( function ( e ) {
        // EventBus.dispatch( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, null, 1 )
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGE, null, 1 )
    } )
    offsetTargetDayBtnMinus.click( function ( e ) {
        // EventBus.dispatch( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, null, -1 )
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGE, null, -1 )
    } )
    
    // availableSensors
    sectionSensors.empty()
    $.each( Object.keys( Sensors ), function ( i, sensorId ) {
        var sensor = Sensors[ sensorId ]
        
        var btn = $( '<button class="btn btn-base btn-sensor round">' + sensor.shortName + '</button>' )
        btn.addClass( sensorId )
        
        btn.click( function ( e ) {
            e.preventDefault()
            var evt = null
            if ( btn.hasClass( 'active' ) ) {
                // evt = Events.SECTION.SCENES_SELECTION.FILTER_HIDE_SENSOR
                evt = Events.SECTION.SEARCH.SEARCH_PARAMS.DESELECT_SENSOR
                // btn.removeClass( 'active' )
            } else {
                // evt = Events.SECTION.SCENES_SELECTION.FILTER_SHOW_SENSOR
                evt = evt = Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_SENSOR
                // btn.addClass( 'active' )
            }
            EventBus.dispatch( evt, null, sensorId )
        } )
        
        sectionSensors.append( btn )
    } )
    
    btnSubmit.click( function ( e ) {
        e.preventDefault()
        formNotify.empty().velocitySlideUp( { delay: 0, duration: 100 } )
        
        if ( SearchParams.sensors.length > 0 ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.BEST_SCENES )
        } else {
            formNotify.html( 'At least one sensor must be selected' ).velocitySlideDown( { delay: 20, duration: 400 } )
        }
    } )
    
    reset()
}

var reset = function () {
    formNotify.empty()
    formNotify.velocitySlideUp( { delay: 0, duration: 0 } )
}

var setSelectedSensors = function ( selectedSensors ) {
    $.each( Object.keys( Sensors ), function ( i, sensorId ) {
        var btn = sectionSensors.find( '.' + sensorId )
        
        if ( selectedSensors.indexOf( sensorId ) >= 0 ) {
            btn.addClass( 'active' )
        } else {
            btn.removeClass( 'active' )
        }
        
    } )
    
}

var setOffsetToTargetDay = function ( value ) {
    offsetTargetDayBtnMinus.prop( 'disabled', (value <= 0) )
    
    var textValue = ''
    if ( value == 0 ) {
        textValue = SearchParams.targetDate.asMoment().format( 'YYYY' )
    } else {
        textValue = value + ' year'
        textValue += ( value > 1 ) ? 's' : ''
    }
    
    html.find( '.offset-target-day' ).html( textValue )
}

var setSortWeight = function ( sortWeight ) {
    sortSlider.noUiSlider.set( sortWeight )
    
    html.find( '.cc-sort' ).html( Math.round( +((1 - sortWeight).toFixed( 2 )) * 100 ) + '%' )
    html.find( '.td-sort' ).html( Math.round( sortWeight * 100 ) + '%' )
}

var hide = function ( options ) {
    parentContainer.velocitySlideUp( options )
}


var firstShow        = false
var toggleVisibility = function ( options ) {
    parentContainer.velocitySlideToggle( options )
    
    if ( !firstShow ) {
        setSelectedSensors( SearchParams.sensors )
        setSortWeight( SearchParams.sortWeight )
        setOffsetToTargetDay( SearchParams.offsetToTargetDay )
    
        firstShow = false
    }
    
}

module.exports = {
    init                  : init
    , reset               : reset
    , setSortWeight       : setSortWeight
    , setOffsetToTargetDay: setOffsetToTargetDay
    , setSelectedSensors  : setSelectedSensors
    , hide                : hide
    , toggleVisibility    : toggleVisibility
    
}