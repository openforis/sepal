/**
 * @author Mino Togna
 */
var EventBus                = require( '../../event/event-bus' )
var Events                  = require( '../../event/events' )
var FormMosaicPreview       = require( './mosaic/form-mosaic-preview' )
var FormMosaicRetrieve      = require( './mosaic/form-mosaic-retrieve' )
var FormScenesAutoSelection = require( './scenes/form-scenes-autoselection-form' )
var ScenesRetrieve          = require( './scenes/scenes-retrieve' )

var html               = null
var btnPreviewMosaic   = null
var btnRetrieveMosaic  = null
var btnToggleLandsat   = null
var btnToggleSentinel2 = null

var init = function ( container ) {
    html = container
    
    btnPreviewMosaic   = html.find( '.btn-preview-mosaic' )
    btnRetrieveMosaic  = html.find( '.btn-retrieve-mosaic' )
    btnToggleLandsat   = html.find( '.btn-toggle-landsat-mosaic' )
    btnToggleSentinel2 = html.find( '.btn-toggle-sentinel2-mosaic' )
    
    FormMosaicPreview.init( html.find( '.row-mosaic-preview' ) )
    FormMosaicRetrieve.init( html.find( '.row-mosaic-retrieve' ) )
    
    initEventHandlers()
    reset()
}

var initEventHandlers = function () {
    
    btnPreviewMosaic.click( function ( e ) {
        e.preventDefault()
        
        $( "#search-retrieve .btn-toggle-section" ).not( this ).removeClass( 'active' )
        $( this ).toggleClass( 'active' )
        
        FormMosaicPreview.toggleVisibility()
        FormScenesAutoSelection.hide()
        ScenesRetrieve.hide()
        FormMosaicRetrieve.hide()
        
    } )
    
    btnRetrieveMosaic.click( function ( e ) {
        e.preventDefault()
        
        $( "#search-retrieve .btn-toggle-section" ).not( this ).removeClass( 'active' )
        $( this ).toggleClass( 'active' )
        
        FormMosaicPreview.hide()
        FormScenesAutoSelection.hide()
        ScenesRetrieve.hide()
        FormMosaicRetrieve.toggleVisibility()
    } )
    
    var toggleVisibility = function ( e, btn, evt ) {
        e.preventDefault()
        btn.toggleClass( 'active' )
        EventBus.dispatch( evt )
    }
    btnToggleLandsat.click( function ( e ) {
        toggleVisibility( e, btnToggleLandsat, Events.SCENE_AREA_MOSAICS.LANDSAT.TOGGLE_VISIBILITY )
    } )
    btnToggleSentinel2.click( function ( e ) {
        toggleVisibility( e, btnToggleSentinel2, Events.SCENE_AREA_MOSAICS.SENTINEL2.TOGGLE_VISIBILITY )
    } )
    
}

var collapse = function ( options ) {
    btnPreviewMosaic.removeClass( 'active' )
    btnRetrieveMosaic.removeClass( 'active' )
    
    FormMosaicPreview.hide( options )
    FormMosaicRetrieve.hide( options )
}

var reset = function () {
    collapse( { delay: 0, duration: 0 } )
    
    disableLandsatButton()
    disableSentinel2Button()
    
    FormMosaicPreview.reset()
    FormMosaicRetrieve.reset()
}

var setSelectedScenesNumber = function ( landsatNoScenes, sentinel2NoScenes ) {
    FormMosaicPreview.setSelectedScenesNumber( landsatNoScenes, sentinel2NoScenes )
    FormMosaicRetrieve.setSelectedScenesNumber( landsatNoScenes, sentinel2NoScenes )
}

var disableLandsatButton = function () {
    btnToggleLandsat.removeClass( 'active' ).disable()
}

var enableLandsatButton = function () {
    btnToggleLandsat.addClass( 'active' ).enable()
}

var disableSentinel2Button = function () {
    btnToggleSentinel2.removeClass( 'active' ).disable()
}

var enableSentinel2Button = function () {
    btnToggleSentinel2.addClass( 'active' ).enable()
}

module.exports = {
    init                     : init
    , collapse               : collapse
    , reset                  : reset
    , setSelectedScenesNumber: setSelectedScenesNumber
    , disableLandsatButton   : disableLandsatButton
    , enableLandsatButton    : enableLandsatButton
    , disableSentinel2Button : disableSentinel2Button
    , enableSentinel2Button  : enableSentinel2Button
}