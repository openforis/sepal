/**
 * @author Mino Togna
 */
require( './scenes-selection-filter.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
// var Filter     = require( './scenes-selection-filter-m' )
var Sensors  = require( '../sensors/sensors' )

var noUiSlider = require( 'nouislider' )
require( '../nouislider/nouislider.css' )

var template = require( './scenes-selection-filter.html' )
var html     = $( template( {} ) )

//ui elements
var container               = null
var sectionBtns             = null
var sectionAction           = null
var sortSlider              = null
var sectionSensors          = null
var offsetTargetDayBtnPlus  = null
var offsetTargetDayBtnMinus = null

var inizialized = false

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
        
        sectionAction.find( '> .row' ).hide( 0 )
        var target = $( this ).data( 'target' )
        setTimeout( function () {
            sectionAction.find( '.' + target ).fadeIn( 250 )
        }, 250 )
        
        sectionBtns.velocity( 'slideUp', { delay: 100, duration: 500 } )
        sectionAction.velocity( 'slideDown', { delay: 100, duration: 500 } )
        
        // sectionBtns.velocity( { opacity: 0 }, { delay: 0, duration: 200 } )
        // sectionAction.velocity( { opacity: 1 }, { delay: 0, duration: 200 } )
    } )
    
    sectionAction.find( '.btn-close-filter' ).click( function ( e ) {
        showButtons()
    } )
    
    //sort slider
    sortSlider = sectionAction.find( '.sort-slider' ).get( 0 )
    if(!sortSlider.hasOwnProperty('noUiSlider')) {
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
            setSortWeight( sortWeight )
            // container.find( '.cc-sort' ).html( Math.round( +((1 - sortWeight).toFixed( 2 )) * 100 ) + '%' )
            // container.find( '.td-sort' ).html( Math.round( sortWeight * 100 ) + '%' )
        } )
    }
    // target day
    offsetTargetDayBtnPlus.click( function ( e ) {
        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, null, 1 )
    } )
    offsetTargetDayBtnMinus.click( function ( e ) {
        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, null, -1 )
    } )
    
    // availableSensors
    sectionSensors.empty()
    $.each( Object.keys( Sensors ), function ( i, sensorId ) {
        // console.log( sensorId )
        
        var sensor = Sensors[ sensorId ]
        
        var btn = $( '<button class="btn btn-base btn-sensor round">' + sensor.shortName + '</button>' )
        btn.addClass( sensorId )
        
        btn.click( function ( e ) {
            e.preventDefault()
            var evt = null
            if ( btn.hasClass( 'active' ) ) {
                evt = Events.SECTION.SCENES_SELECTION.FILTER_HIDE_SENSOR
                // btn.removeClass( 'active' )
            } else {
                evt = Events.SECTION.SCENES_SELECTION.FILTER_SHOW_SENSOR
                // btn.addClass( 'active' )
            }
            EventBus.dispatch( evt, null, sensorId )
        } )
        
        sectionSensors.append( btn )
    } )
    
    inizialized = true
}

var showButtons = function () {
    sectionAction.find( '> .row' ).fadeOut( 400 )
    sectionBtns.velocity( 'slideDown', { delay: 100, duration: 500 } )
    sectionAction.velocity( 'slideUp', { delay: 100, duration: 500 } )
    
    // sectionBtns.velocity( { opacity: 1 }, { delay: 0, duration: 200 } )
    // sectionAction.velocity( { opacity: 0 }, { delay: 0, duration: 200 } )
}

var setSensors = function ( availableSensors, selectedSensors ) {
    // _availableSensors = availableSensors
    $.each( Object.keys( Sensors ), function ( i, sensorId ) {
        // var sensor = Sensors[ sensorId ]
        var btn = sectionSensors.find( '.' + sensorId )
        
        // if ( selectedSensors.indexOf( sensorId ) >= 0 ) {
        //     btn.addClass( 'active' )
        // }
        
        var disabled = availableSensors.indexOf( sensorId ) < 0
        btn.prop( 'disabled', disabled )
    } )
    setSelectedSensors( availableSensors, selectedSensors )
}

var setSelectedSensors = function ( availableSensors, selectedSensors ) {
    //update button status
    var selectedCnt = 0
    $.each( Object.keys( Sensors ), function ( i, sensorId ) {
        // var sensor = Sensors[ sensorId ]
        var btn = sectionSensors.find( '.' + sensorId )
        
        if ( selectedSensors.indexOf( sensorId ) >= 0 && availableSensors.indexOf( sensorId ) >= 0 ) {
            btn.addClass( 'active' )
            selectedCnt++
        } else {
            btn.removeClass( 'active' )
        }
        
    } )
    // update text
    var text = 'All'
    
    if ( selectedCnt == 0 ) {
        text = 'None'
    }
    else if ( availableSensors.length != selectedCnt ) {
        var array = []
        $.each( selectedSensors, function ( i, sensor ) {
            if ( availableSensors.indexOf( sensor ) >= 0 ) {
                array.push( Sensors[ sensor ].shortName )
            }
        } )
        text = array.join( ', ' )
    }
    container.find( '.selected-sensors' ).html( text )
}


var setOffsetToTargetDay = function ( value ) {
    offsetTargetDayBtnMinus.prop( 'disabled', (value <= 1) )
    
    var textValue = value + ' year'
    if ( value > 1 ) {
        textValue += 's'
    }
    container.find( '.offset-target-day' ).html( textValue )
}

var setSortWeight = function ( sortWeight ) {
    sortSlider.noUiSlider.set( sortWeight )
    
    container.find( '.cc-sort' ).html( Math.round( +((1 - sortWeight).toFixed( 2 )) * 100 ) + '%' )
    container.find( '.td-sort' ).html( Math.round( sortWeight * 100 ) + '%' )
    
}

module.exports = {
    init                  : init
    , setSensors          : setSensors
    , setSelectedSensors  : setSelectedSensors
    , setOffsetToTargetDay: setOffsetToTargetDay
    , showButtons         : showButtons
    , setSortWeight       : setSortWeight
    , isInitialzied       : function () {
        return inizialized
    }
    
}