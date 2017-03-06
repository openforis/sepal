/**
 * @author Mino Togna
 */
var EventBus                = require( '../../event/event-bus' )
var Events                  = require( '../../event/events' )
var FormScenesAutoSelection = require( './scenes/form-scenes-autoselection-form' )
var ScenesRetrieve          = require( './scenes/scenes-retrieve' )
var FormMosaicPreview       = require( './mosaic/form-mosaic-preview' )
var FormMosaicRetrieve      = require( './mosaic/form-mosaic-retrieve' )

var html                         = null
var btnRetrieveScenes            = null
var btnBestScenes                = null
// var btnToggleLayerVisibility     = null
var btnToggleLandsatVisibility   = null
var btnToggleSentinel2Visibility = null

var init = function ( container ) {
    html = container
    
    btnBestScenes                = html.find( '.btn-best-scenes' )
    btnRetrieveScenes            = html.find( '.btn-retrieve-scenes' )
    // btnToggleLayerVisibility = html.find( '.btn-hide-scene-areas' )
    btnToggleLandsatVisibility   = html.find( '.btn-toggle-landsat-visibility' )
    btnToggleSentinel2Visibility = html.find( '.btn-toggle-sentinel2-visibility' )
    
    FormScenesAutoSelection.init( html.find( '.row-best-scenes-form' ) )
    ScenesRetrieve.init( html.find( '.row-scenes-retrieve' ) )
    
    initEventHandlers()
    reset()
}

var initEventHandlers = function () {
    
    btnBestScenes.click( function ( e ) {
        e.preventDefault()
        
        $( "#search-retrieve .btn-toggle-section" ).not( this ).removeClass( 'active' )
        $( this ).toggleClass( 'active' )
        
        FormMosaicPreview.hide()
        FormMosaicRetrieve.hide()
        ScenesRetrieve.hide()
        FormScenesAutoSelection.toggleVisibility()
    } )
    
    btnRetrieveScenes.click( function ( e ) {
        
        $( "#search-retrieve .btn-toggle-section" ).not( this ).removeClass( 'active' )
        $( this ).toggleClass( 'active' )
        
        FormMosaicPreview.hide()
        FormMosaicRetrieve.hide()
        FormScenesAutoSelection.hide()
        ScenesRetrieve.toggleVisibility()
        
    } )
    
    btnToggleLandsatVisibility.click( function () {
        btnToggleLandsatVisibility.toggleClass( 'active' )
        
        if ( btnToggleLandsatVisibility.hasClass( 'active' ) ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.SHOW_LANDSAT_AREA )
            btnToggleSentinel2Visibility.removeClass( 'active' )
        } else {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.HIDE_LANDSAT_AREA )
        }
    } )
    
    btnToggleSentinel2Visibility.click( function () {
        btnToggleSentinel2Visibility.toggleClass( 'active' )
        
        if ( btnToggleSentinel2Visibility.hasClass( 'active' ) ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.SHOW_SENTINEL2_AREA )
            btnToggleLandsatVisibility.removeClass( 'active' )
        } else {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.HIDE_SENTINEL2_AREA )
        }
    } )
    
    // btnToggleLayerVisibility.click( function ( e ) {
    //     e.preventDefault()
    //     btnToggleLayerVisibility.toggleClass( 'active' )
    //     EventBus.dispatch( Events.MAP.SCENE_AREA_TOGGLE_VISIBILITY )
    // } )
    
}

var collapse = function ( options ) {
    btnBestScenes.removeClass( 'active' )
    btnRetrieveScenes.removeClass( 'active' )
    FormScenesAutoSelection.hide( options )
    ScenesRetrieve.hide( options )
}

var reset = function () {
    collapse( { delay: 0, duration: 0 } )
    btnToggleLandsatVisibility.addClass( 'active' )
    btnToggleSentinel2Visibility.removeClass( 'active' )
    FormScenesAutoSelection.reset()
}

module.exports = {
    init                     : init
    , collapse               : collapse
    , reset                  : reset
    // Scenes auto selection form set value methods
    , setSortWeight          : FormScenesAutoSelection.setSortWeight
    , setOffsetToTargetDay   : FormScenesAutoSelection.setOffsetToTargetDay
    , setSelectedSensors     : FormScenesAutoSelection.setSelectedSensors
    , setSelectedScenesNumber: ScenesRetrieve.setScenesNumber
}