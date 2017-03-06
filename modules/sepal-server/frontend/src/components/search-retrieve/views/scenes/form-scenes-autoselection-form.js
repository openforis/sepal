/**
 * @author M. Togna
 */
require( './form-scenes-autoselection.scss' )

var SearchParams = require( './../../../search/search-params' )
// var Filter       = require( '../../../scenes-selection/views/scenes-selection-filter/scenes-selection-filter-m' )

var EventBus         = require( '../../../event/event-bus' )
var Events           = require( '../../../event/events' )
var LandsatSensors   = require( '../../../sensors/landsat-sensors' )
var Sentinel2Sensors = require( '../../../sensors/sentinel2-sensors' )

var noUiSlider = require( 'nouislider' )
require( '../../../nouislider/nouislider.css' )

var parentContainer = null
var template        = require( './form-scenes-autoselection.html' )
var html            = $( template( {} ) )

//UI elements
var sortSlider              = null
var sectionLandsatSensors   = null
var sectionSentinel2Sensors = null
var offsetTargetDayBtnPlus  = null
var offsetTargetDayBtnMinus = null
var minScenesInput          = null
var maxScenesInput          = null
// form
var btnSubmit               = null
// form notify
var formNotify              = null

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.scenes-selection-filter' )
    container.append( html )
    
    sectionLandsatSensors   = html.find( '.landsat-sensors' )
    sectionSentinel2Sensors = html.find( '.sentinel2-sensors' )
    offsetTargetDayBtnPlus  = html.find( '.offset-target-day-btn-plus' )
    offsetTargetDayBtnMinus = html.find( '.offset-target-day-btn-minus' )
    
    minScenesInput = html.find( 'input[name=minScenes]' )
    maxScenesInput = html.find( 'input[name=maxScenes]' )
    
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
    
    // Landsat Sensors
    sectionLandsatSensors.empty()
    $.each( Object.keys( LandsatSensors ), function ( i, sensorId ) {
        var sensor = LandsatSensors[ sensorId ]
        
        var btn = $( '<button class="btn btn-base btn-sensor round">' + sensor.shortName + '</button>' )
        btn.addClass( sensorId )
        
        btn.click( function ( e ) {
            e.preventDefault()
            var evt = null
            if ( btn.hasClass( 'active' ) ) {
                evt = Events.SECTION.SEARCH.SEARCH_PARAMS.DESELECT_LANDSAT_SENSOR
            } else {
                evt = evt = Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_LANDSAT_SENSOR
            }
            EventBus.dispatch( evt, null, sensorId )
        } )
        
        sectionLandsatSensors.append( btn )
    } )
    //sentinel2 sensors
    sectionSentinel2Sensors.empty()
    $.each( Object.keys( Sentinel2Sensors ), function ( i, sensorId ) {
        var sensor = Sentinel2Sensors[ sensorId ]
        
        var btn = $( '<button class="btn btn-base btn-sensor round">' + sensor.shortName + '</button>' )
        btn.addClass( sensorId )
        
        btn.click( function ( e ) {
            e.preventDefault()
            var evt = null
            if ( btn.hasClass( 'active' ) ) {
                evt = Events.SECTION.SEARCH.SEARCH_PARAMS.DESELECT_SENTINEL2_SENSOR
            } else {
                evt = evt = Events.SECTION.SEARCH.SEARCH_PARAMS.SELECT_SENTINEL2_SENSOR
            }
            EventBus.dispatch( evt, null, sensorId )
        } )
        
        sectionSentinel2Sensors.append( btn )
    } )
    
    
    // number of scenes
    minScenesInput.change( function ( e ) {
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.MIN_SCENES_CHANGE, null, minScenesInput.val() )
    } )
    
    maxScenesInput.change( function ( e ) {
        EventBus.dispatch( Events.SECTION.SEARCH.SEARCH_PARAMS.MAX_SCENES_CHANGE, null, maxScenesInput.val() )
    } )
    
    // submit form
    btnSubmit.click( function ( e ) {
        e.preventDefault()
        formNotify.empty().velocitySlideUp( { delay: 0, duration: 100 } )
        
        if ( SearchParams.landsatSensors.length <= 0 && SearchParams.sentinel2Sensors.length <= 0 ) {
            formNotify.html( 'At least one sensor must be selected' ).velocitySlideDown( { delay: 20, duration: 400 } )
        } else if ( SearchParams.maxScenes && SearchParams.minScenes > SearchParams.maxScenes ) {
            formNotify.html( 'Min number of scenes cannot be greater than Max number of scenes' ).velocitySlideDown( { delay: 20, duration: 400 } )
        } else {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.BEST_SCENES )
        }
    } )
    
    reset()
}

var reset = function () {
    formNotify.empty()
    formNotify.velocitySlideUp( { delay: 0, duration: 0 } )
}

var setSelectedSensors = function ( selectedLandsatSensors, selectedSentinel2Sensors ) {
    $.each( Object.keys( LandsatSensors ), function ( i, sensorId ) {
        var btn = sectionLandsatSensors.find( '.' + sensorId )
        if ( selectedLandsatSensors.indexOf( sensorId ) >= 0 )
            btn.addClass( 'active' )
        else
            btn.removeClass( 'active' )
    } )
    
    $.each( Object.keys( Sentinel2Sensors ), function ( i, sensorId ) {
        var btn = sectionSentinel2Sensors.find( '.' + sensorId )
        if ( selectedSentinel2Sensors.indexOf( sensorId ) >= 0 )
            btn.addClass( 'active' )
        else
            btn.removeClass( 'active' )
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
        setSelectedSensors( SearchParams.landsatSensors, SearchParams.sentinel2Sensors )
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