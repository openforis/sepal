/**
 * @author Mino Togna
 */
require( './section-filter-scenes/scenes-selection-filter.scss' )
var moment   = require( 'moment' )
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var SModel   = require( './../../search/model/search-model' )

// var LandsatSensors   = require( '../../sensors/landsat-sensors' )
// var Sentinel2Sensors = require( '../../sensors/sentinel2-sensors' )
// var SearchParams     = require( '../../search/search-params' )

var noUiSlider = require( 'nouislider' )
require( '../../nouislider/nouislider.css' )

var dataSet = null

var html                    = null
//ui elements
var container               = null
var sectionBtns             = null
var sectionAction           = null
var sortSlider              = null
var sectionLandsatSensors   = null
var sectionSentinel2Sensors = null
var offsetTargetDayBtnPlus  = null
var offsetTargetDayBtnMinus = null

var state       = {}

var init        = function ( uiContainer ) {
    container = $( uiContainer )
    
    var template = require( './section-filter-scenes/scenes-selection-filter.html' )
    html         = $( template( {} ) )
    
    container.prepend( html )
    sectionBtns   = container.find( '.section-btn' )
    sectionAction = container.find( '.section-options' )
    
    sectionLandsatSensors   = sectionAction.find( '.LANDSAT-sensors' )
    sectionSentinel2Sensors = sectionAction.find( '.SENTINEL2-sensors' )
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
        
    } )
    
    sectionAction.find( '.btn-close-filter' ).click( function ( e ) {
        showButtons()
    } )
    
    //sort slider
    sortSlider = sectionAction.find( '.sort-slider' ).get( 0 )
    if ( !sortSlider.hasOwnProperty( 'noUiSlider' ) ) {
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
            state.sortWeight = sortWeight
            
            EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state )
            EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED )
        } )
    }
    
    // target day
    offsetTargetDayBtnPlus.click( function ( e ) {
        state.offsetToTargetDay += 1
        EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state )
        EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED )
    } )
    offsetTargetDayBtnMinus.click( function ( e ) {
        state.offsetToTargetDay -= 1
        EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state )
        EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED )
    } )
    
    var addSensors = function ( sensors, section ) {
        section.empty()
        $.each( Object.keys( sensors ), function ( i, sensorId ) {
            var sensor = sensors[ sensorId ]
            
            var btn = $( '<button class="btn btn-base btn-sensor round">' + sensor.shortName + '</button>' )
            btn.addClass( sensorId )
            
            btn.click( function ( e ) {
                e.preventDefault()
                var evt = null
                if ( btn.hasClass( 'active' ) ) {
                    state.sensors.splice( state.sensors.indexOf( sensorId ), 1 )
                } else {
                    state.sensors.push( sensorId )
                }
                EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state )
                EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_SEARCH_PARAMS_CHANGED )
            } )
            
            section.append( btn )
        } )
    }
    $.each( SModel.getSensorGroups(), function ( i, sGroup ) {
        addSensors( SModel.getSensors( sGroup ), sectionAction.find( '.' + sGroup + '-sensors' ) )
    } )
    toggleSensors()
}

var toggleSensors = function () {
    if ( sectionLandsatSensors && sectionLandsatSensors ) {
        sectionAction.find( '.sensors' ).hide()
        sectionAction.find( '.' + dataSet + '-sensors' ).show()
    }
}

var setDataSet = function ( value ) {
    dataSet = value
    toggleSensors()
}

var showButtons = function () {
    sectionAction.find( '> .row' ).fadeOut( 400 )
    sectionBtns.velocity( 'slideDown', { delay: 100, duration: 500 } )
    sectionAction.velocity( 'slideUp', { delay: 100, duration: 500 } )
    
}

var setSensors = function ( availableSensors, selectedSensors ) {
    
    var section = sectionAction.find( '.' + dataSet + '-sensors' )
    var sensors = SModel.getSensors( dataSet )
    
    $.each( Object.keys( sensors ), function ( i, sensorId ) {
        var btn      = section.find( '.' + sensorId )
        var disabled = availableSensors.indexOf( sensorId ) < 0
        btn.prop( 'disabled', disabled )
    } )
    
    setSelectedSensors( availableSensors, selectedSensors, sensors, section )
}

var setSelectedSensors = function ( availableSensors, selectedSensors, sensors, section ) {
    //update button status
    var selectedCnt = 0
    $.each( Object.keys( sensors ), function ( i, sensorId ) {
        var btn = section.find( '.' + sensorId )
        
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
                array.push( sensors[ sensor ].shortName )
            }
        } )
        text = array.join( ', ' )
    }
    container.find( '.selected-sensors' ).html( text )
}


var setOffsetToTargetDay = function ( value ) {
    offsetTargetDayBtnMinus.prop( 'disabled', (value <= 0) )
    
    var textValue = ''
    if ( value == 0 ) {
        textValue = moment( state.targetDate ).format( 'YYYY' )
    } else {
        textValue = value + ' year'
        textValue += ( value > 1 ) ? 's' : ''
    }
    
    container.find( '.offset-target-day' ).html( textValue )
}

var setSortWeight = function ( sortWeight ) {
    sortSlider.noUiSlider.set( sortWeight )
    
    container.find( '.cc-sort' ).html( Math.round( +((1 - sortWeight).toFixed( 2 )) * 100 ) + '%' )
    container.find( '.td-sort' ).html( Math.round( sortWeight * 100 ) + '%' )
}

var updateState = function ( e, s ) {
    state = s
}
EventBus.addEventListener( Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, updateState )

module.exports = {
    init                  : init
    , setSensors          : setSensors
    , setDataSet          : setDataSet
    , setOffsetToTargetDay: setOffsetToTargetDay
    , showButtons         : showButtons
    , setSortWeight       : setSortWeight
}