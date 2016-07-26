/**
 * @author Mino Togna
 */

require( './search-retrieve.scss' )

var EventBus             = require( '../event/event-bus' )
var Events               = require( '../event/events' )
var ScenesAutoSelectForm = require( './scenes-autoselection-form-v' )
var MosaicPreviewForm    = require( './mosaic-preview-form' )

// html
var template = require( './search-retrieve.html' )
var html     = $( template( {} ) )

var btnRetrieveScenes = null
var btnBestScenes     = null
var btnPreviewMosaic  = null
var btnRetrieveMosaic = null

var btnHideSceneAreas = null
var btnHideMosaic     = null

var formBestScenes    = null
var mosaicPreviewForm = null

var init = function () {
    $( '.app' ).append( html )
    
    // buttons
    btnBestScenes     = html.find( '.btn-best-scenes' )
    btnRetrieveScenes = html.find( '.btn-retrieve-scenes' )
    btnPreviewMosaic  = html.find( '.btn-preview-mosaic' )
    btnRetrieveMosaic = html.find( '.btn-retrieve-mosaic' )
    //toggle visibility buttons
    btnHideSceneAreas = html.find( '.btn-hide-scene-areas' )
    btnHideMosaic     = html.find( '.btn-hide-mosaic' )
    // expandable forms
    formBestScenes    = html.find( '.row-best-scenes-form' )
    mosaicPreviewForm = html.find( '.row-mosaic-preview' )
    
    ScenesAutoSelectForm.init( html.find( '.scenes-selection-filter' ) )
    MosaicPreviewForm.init( html.find( '.mosaic-preview' ) )
    
    initEventHandlers()
    reset()
    
}

var slide = function ( element, slideDir, options ) {
    var slideOptions = { delay: 50, duration: 500 }
    slideOptions     = $.extend( slideOptions, options )
    
    element.velocity( slideDir, slideOptions )
    
}

var slideToggle = function ( element, options ) {
    var isOpen   = element.is( ':visible' )
    var slideDir = isOpen ? 'slideUp' : 'slideDown'
    slide( element, slideDir, options )
}

var slideUp = function ( element, options ) {
    slide( element, 'slideUp', options )
}

var slideDown = function ( element, options ) {
    slide( element, 'slideDown', options )
}

var initEventHandlers = function () {
    
    btnBestScenes.click( function ( e ) {
        e.preventDefault()
        slideUp( mosaicPreviewForm )
        slideToggle( formBestScenes )
    } )
    btnRetrieveScenes.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES )
    } )
    
    btnPreviewMosaic.click( function ( e ) {
        e.preventDefault()
        slideUp( formBestScenes )
        slideToggle( mosaicPreviewForm )
    } )
    btnRetrieveMosaic.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_MOSAIC )
    } )
    
    btnHideSceneAreas.click( function ( e ) {
        e.preventDefault()
        btnHideSceneAreas.toggleClass( 'active' )
        EventBus.dispatch( Events.MAP.SCENE_AREA_TOGGLE_VISIBILITY )
    } )
    
    btnHideMosaic.click( function ( e ) {
        e.preventDefault()
        btnHideMosaic.toggleClass( 'active' )
        EventBus.dispatch( Events.MAP.EE_LAYER_TOGGLE_VISIBILITY )
    } )
    
}

var show = function () {
    if ( !html.is( ':visible' ) ) {
        slideDown( html, { delay: 200, duration: 1000 } )
    }
}

var hide = function ( opts ) {
    var options = { delay: 200, duration: 1000 }
    options     = $.extend( options, opts )
    slideUp( html, options )
}

var reset = function () {
    disableToggleLayerButtons()
    disableScenesSelectionRequiredButtons()
    
    btnRetrieveMosaic.prop( 'disabled', true )
    
    slideUp( formBestScenes, { delay: 0, duration: 0 } )
    slideUp( mosaicPreviewForm, { delay: 0, duration: 0 } )
}

var collapse = function () {
    slideUp( formBestScenes )
    slideUp( mosaicPreviewForm )
}

var enableToggleLayerButtons = function () {
    btnHideSceneAreas.addClass( 'active' ).prop( 'disabled', false )
    btnHideMosaic.addClass( 'active' ).prop( 'disabled', false )
}

var disableToggleLayerButtons = function () {
    btnHideSceneAreas.removeClass( 'active' ).prop( 'disabled', true )
    btnHideMosaic.removeClass( 'active' ).prop( 'disabled', true )
}

var enableScenesSelectionRequiredButtons  = function () {
    btnPreviewMosaic.prop( 'disabled', false )
    btnRetrieveScenes.prop( 'disabled', false )
}

var disableScenesSelectionRequiredButtons = function () {
    btnPreviewMosaic.prop( 'disabled', true )
    btnRetrieveScenes.prop( 'disabled', true )
}

module.exports = {
    init                                   : init
    , show                                 : show
    , hide                                 : hide
    , reset                                : reset
    , collapse                             : collapse
    , enableToggleLayerButtons             : enableToggleLayerButtons
    , disableToggleLayerButtons            : disableToggleLayerButtons
    , enableScenesSelectionRequiredButtons : enableScenesSelectionRequiredButtons
    , disableScenesSelectionRequiredButtons: disableScenesSelectionRequiredButtons
}