/**
 * @author Mino Togna
 */
require( './scenes-selection-filter.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
// var Filter     = require( './scenes-selection-filter-m' )

var noUiSlider = require( 'nouislider' )
require( './nouislider.css' )

var template = require( './scenes-selection-filter.html' )
var html     = $( template( {} ) )

var availableSensors = []

//ui elements
var container     = null
var sectionBtns   = null
var sectionAction = null

var sectionSensors          = null
var offsetTargetDayBtnPlus  = null
var offsetTargetDayBtnMinus = null

var init = function ( uiContainer ) {
    container = $( uiContainer )
    
    container.prepend( html )
    sectionBtns   = container.find( '.section-btn' )
    sectionAction = container.find( '.section-options' )
    
    sectionSensors          = sectionAction.find( '.sensors' )
    offsetTargetDayBtnPlus  = sectionAction.find( '.offset-target-day-btn-plus' )
    offsetTargetDayBtnMinus = sectionAction.find( '.offset-target-day-btn-minus' )
    
    // sliding functions
    sectionAction.velocity( 'slideUp', { delay: 0, duration: 0 } )
    sectionBtns.find( '.row > div' ).click( function ( e ) {
        
        sectionAction.find( '> .row' ).hide()
        var target = $( this ).data( 'target' )
        sectionAction.find( '.' + target ).show()
        
        sectionBtns.velocity( 'slideUp', { delay: 100, duration: 500 } )
        sectionAction.velocity( 'slideDown', { delay: 100, duration: 500 } )
    } )
    
    sectionAction.find( '.btn-close-filter' ).click( function ( e ) {
        showButtons()
    } )
    
    //sort slider
    var sortSlider = sectionAction.find( '.sort-slider' ).get( 0 )
    noUiSlider.create( sortSlider, {
        start: [ 0.5 ],
        step : 0.05,
        range: {
            'min': [ 0 ],
            'max': [ 1 ]
        }
    } )
    sortSlider.noUiSlider.on( 'change', function () {
        var sortWeight = sortSlider.noUiSlider.get()
        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.SORT_CHANGE, null, sortWeight )
        container.find( '.cc-sort' ).html( Math.round( +((1 - sortWeight).toFixed( 2 )) * 100 ) + '%' )
        container.find( '.td-sort' ).html( Math.round( sortWeight * 100 ) + '%' )
    } )
    
    offsetTargetDayBtnPlus.click( function ( e ) {
        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, null, 1 )
    } )
    offsetTargetDayBtnMinus.click( function ( e ) {
        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, null, -1 )
    } )
}

var showButtons = function () {
    sectionBtns.velocity( 'slideDown', { delay: 100, duration: 500 } )
    sectionAction.velocity( 'slideUp', { delay: 100, duration: 500 } )
}

var setSensors = function ( sensors, selectedSensors ) {
    sectionSensors.empty()
    availableSensors = sensors
    $.each( sensors, function ( i, sensor ) {
        // console.log( sensor )
        
        var btn = $( '<a class="btn btn-base btn-sensor round">' + sensor + '</a>' )
        btn.addClass( sensor )
        
        if ( selectedSensors.indexOf( sensor ) >= 0 ) {
            btn.addClass( 'active' )
        }
        btn.click( function ( e ) {
            e.preventDefault()
            var evt = null
            if ( btn.hasClass( 'active' ) ) {
                evt = Events.SECTION.SCENES_SELECTION.FILTER_HIDE_SENSOR
                btn.removeClass( 'active' )
            } else {
                evt = Events.SECTION.SCENES_SELECTION.FILTER_SHOW_SENSOR
                btn.addClass( 'active' )
            }
            EventBus.dispatch( evt, null, sensor )
        } )
        
        sectionSensors.append( btn )
    } )
}

var setOffsetToTargetDay = function ( value ) {
    offsetTargetDayBtnMinus.prop( 'disabled', (value <= 1) )
    
    var textValue = value + ' year'
    if ( value > 1 ) {
        textValue += 's'
    }
    container.find( '.offset-target-day' ).html( textValue )
}

module.exports = {
    init                  : init
    , setSensors          : setSensors
    , setOffsetToTargetDay: setOffsetToTargetDay
    , showButtons         : showButtons
}