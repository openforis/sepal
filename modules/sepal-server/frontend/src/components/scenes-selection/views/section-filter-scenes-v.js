/**
 * @author Mino Togna
 */
require( './section-filter-scenes/scenes-selection-filter.scss' )

var EventBus         = require( '../../event/event-bus' )
var Events           = require( '../../event/events' )
var LandsatSensors   = require( '../../sensors/landsat-sensors' )
var Sentinel2Sensors = require( '../../sensors/sentinel2-sensors' )
var SearchParams     = require( '../../search/search-params' )

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

var init = function ( uiContainer ) {
    container = $( uiContainer )
    
    var template = require( './section-filter-scenes/scenes-selection-filter.html' )
    html         = $( template( {} ) )
    
    container.prepend( html )
    sectionBtns   = container.find( '.section-btn' )
    sectionAction = container.find( '.section-options' )
    
    sectionLandsatSensors   = sectionAction.find( '.landsat-sensors' )
    sectionSentinel2Sensors = sectionAction.find( '.sentinel2-sensors' )
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
            // EventBus.dispatch( Events.SECTION.SCENES_SELECTION.SORT_CHANGE, null, sortWeight )
            setSortWeight( sortWeight )
            EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.WEIGHT_CHANGE, null, sortWeight )
        } )
    }
    
    // target day
    offsetTargetDayBtnPlus.click( function ( e ) {
        // EventBus.dispatch( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, null, 1 )
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGE, 'section-filter-scenes', 1 )
    } )
    offsetTargetDayBtnMinus.click( function ( e ) {
        // EventBus.dispatch( Events.SECTION.SCENES_SELECTION.FILTER_TARGET_DAY_CHANGE, null, -1 )
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.OFFSET_TARGET_DAY_CHANGE, 'section-filter-scenes', -1 )
    } )
    
    // availableSensors
    // sectionLandsatSensors.empty()
    // sectionSentinel2Sensors.empty()
    
    var addSensors = function ( sensors, section, selectEvt, deselectEvt ) {
        section.empty()
        $.each( Object.keys( sensors ), function ( i, sensorId ) {
            var sensor = sensors[ sensorId ]
            
            var btn = $( '<button class="btn btn-base btn-sensor round">' + sensor.shortName + '</button>' )
            btn.addClass( sensorId )
            
            btn.click( function ( e ) {
                e.preventDefault()
                var evt = null
                if ( btn.hasClass( 'active' ) ) {
                    evt = Events.SECTION.SEARCH.SEARCH_PARAMS[ deselectEvt ]
                } else {
                    evt = evt = Events.SECTION.SEARCH.SEARCH_PARAMS[ selectEvt ]
                }
                EventBus.dispatch( evt, null, sensorId )
            } )
            
            section.append( btn )
        } )
    }
    addSensors( LandsatSensors, sectionLandsatSensors, 'SELECT_LANDSAT_SENSOR', 'DESELECT_LANDSAT_SENSOR' )
    addSensors( Sentinel2Sensors, sectionSentinel2Sensors, 'SELECT_SENTINEL2_SENSOR', 'DESELECT_SENTINEL2_SENSOR' )
    toggleSensors()
}

var toggleSensors = function () {
    if ( sectionLandsatSensors && sectionLandsatSensors ) {
        sectionLandsatSensors.hide()
        sectionSentinel2Sensors.hide()
        
        if ( dataSet == SearchParams.SENSORS.LANDSAT )
            sectionLandsatSensors.show()
        else if ( dataSet == SearchParams.SENSORS.SENTINEL2 )
            sectionSentinel2Sensors.show()
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
    
    var section = null
    var sensors = null
    if ( dataSet == SearchParams.SENSORS.LANDSAT ) {
        section = sectionLandsatSensors
        sensors = LandsatSensors
    } else if ( dataSet == SearchParams.SENSORS.SENTINEL2 ) {
        section = sectionSentinel2Sensors
        sensors = Sentinel2Sensors
    }
    
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
        textValue = SearchParams.targetDate.asMoment().format( 'YYYY' )
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

module.exports = {
    init                  : init
    , setSensors          : setSensors
    , setDataSet          : setDataSet
    // , setSelectedSensors  : setSelectedSensors
    , setOffsetToTargetDay: setOffsetToTargetDay
    , showButtons         : showButtons
    , setSortWeight       : setSortWeight
}