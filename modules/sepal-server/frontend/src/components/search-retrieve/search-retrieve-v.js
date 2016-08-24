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
    var id  = html.attr( 'id' )
    var app = $( '.app' )
    if ( app.find( '#' + id ).children().length <= 0 ) {
        
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
    
}

var defaultSlideOpts = { delay: 50, duration: 500 }

var initEventHandlers = function () {
    
    btnBestScenes.click( function ( e ) {
        e.preventDefault()
        mosaicPreviewForm.velocitySlideUp( defaultSlideOpts )
        formBestScenes.velocitySlideToggle( defaultSlideOpts )
    } )
    
    btnRetrieveScenes.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES )
    } )
    
    btnPreviewMosaic.click( function ( e ) {
        e.preventDefault()
        formBestScenes.velocitySlideUp( defaultSlideOpts )
        mosaicPreviewForm.velocitySlideToggle( defaultSlideOpts )
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
        html.velocitySlideDown( { delay: 300, duration: 800 } )
    }
}

var hide = function ( opts ) {
    var options = { delay: 100, duration: 800 }
    options     = $.extend( options, opts )
    html.velocitySlideUp( options )
}

var reset = function () {
    disableToggleLayerButtons()
    disableScenesSelectionRequiredButtons()
    
    btnRetrieveMosaic.disable()
    
    formBestScenes.velocitySlideUp( { delay: 0, duration: 0 } )
    mosaicPreviewForm.velocitySlideUp( { delay: 0, duration: 0 } )
}

var collapse = function () {
    formBestScenes.velocitySlideUp( defaultSlideOpts )
    mosaicPreviewForm.velocitySlideUp( defaultSlideOpts )
}

var enableToggleLayerButtons = function () {
    btnHideSceneAreas.addClass( 'active' ).enable()
    btnHideMosaic.addClass( 'active' ).enable()
}

var disableToggleLayerButtons = function () {
    btnHideSceneAreas.removeClass( 'active' ).disable()
    btnHideMosaic.removeClass( 'active' ).disable()
}

var enableScenesSelectionRequiredButtons = function () {
    btnPreviewMosaic.enable()
    btnRetrieveScenes.enable()
}

var disableScenesSelectionRequiredButtons = function () {
    btnPreviewMosaic.disable()
    btnRetrieveScenes.disable()
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