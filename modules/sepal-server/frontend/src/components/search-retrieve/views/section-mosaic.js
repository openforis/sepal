/**
 * @author Mino Togna
 */
var EventBus             = require( '../../event/event-bus' )
var Events               = require( '../../event/events' )
var MosaicPreviewForm    = require( './mosaic/mosaic-preview-form' )
var ScenesAutoSelectForm = require( './scenes/scenes-autoselection-form-v' )

var html                     = null
var btnPreviewMosaic         = null
var btnRetrieveMosaic        = null
var btnToggleLayerVisibility = null

var init = function ( container ) {
    html = container
    
    btnPreviewMosaic         = html.find( '.btn-preview-mosaic' )
    btnRetrieveMosaic        = html.find( '.btn-retrieve-mosaic' )
    btnToggleLayerVisibility = html.find( '.btn-hide-mosaic' )
    
    MosaicPreviewForm.init( html.find( '.row-mosaic-preview' ) )
    
    initEventHandlers()
    reset()
}

var initEventHandlers = function () {
    
    btnPreviewMosaic.click( function ( e ) {
        e.preventDefault()
        MosaicPreviewForm.toggleVisibility()
        ScenesAutoSelectForm.hide()
    } )
    btnRetrieveMosaic.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_MOSAIC )
    } )
    
    btnToggleLayerVisibility.click( function ( e ) {
        e.preventDefault()
        btnToggleLayerVisibility.toggleClass( 'active' )
        EventBus.dispatch( Events.MAP.EE_LAYER_TOGGLE_VISIBILITY )
    } )
    
}


var collapse = function ( options ) {
    MosaicPreviewForm.hide( options )
}

var reset = function () {
    btnRetrieveMosaic.disable()
    
    collapse( { delay: 0, duration: 0 } )
}

module.exports = {
    init      : init
    , collapse: collapse
    , reset   : reset
}