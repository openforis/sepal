/**
 * @author Mino Togna
 */
var EventBus                = require( '../../event/event-bus' )
var Events                  = require( '../../event/events' )
var FormMosaicPreview       = require( './mosaic/form-mosaic-preview' )
var FormMosaicRetrieve      = require( './mosaic/form-mosaic-retrieve' )
var FormScenesAutoSelection = require( './scenes/form-scenes-autoselection-form' )

var html                     = null
var btnPreviewMosaic         = null
var btnRetrieveMosaic        = null
var btnToggleLayerVisibility = null

var init = function ( container ) {
    html = container
    
    btnPreviewMosaic         = html.find( '.btn-preview-mosaic' )
    btnRetrieveMosaic        = html.find( '.btn-retrieve-mosaic' )
    btnToggleLayerVisibility = html.find( '.btn-hide-mosaic' )
    
    FormMosaicPreview.init( html.find( '.row-mosaic-preview' ) )
    FormMosaicRetrieve.init( html.find( '.row-mosaic-retrieve' ) )
    
    initEventHandlers()
    reset()
}

var initEventHandlers = function () {
    
    btnPreviewMosaic.click( function ( e ) {
        e.preventDefault()
        
        $( this ).toggleClass( 'active' )
        FormMosaicPreview.toggleVisibility()
        FormScenesAutoSelection.hide()
        FormMosaicRetrieve.hide()
        
    } )
    
    btnRetrieveMosaic.click( function ( e ) {
        e.preventDefault()
        
        $( this ).toggleClass( 'active' )
        FormMosaicPreview.hide()
        FormScenesAutoSelection.hide()
        FormMosaicRetrieve.toggleVisibility()
    } )
    
    btnToggleLayerVisibility.click( function ( e ) {
        e.preventDefault()
        btnToggleLayerVisibility.toggleClass( 'active' )
        EventBus.dispatch( Events.MAP.EE_LAYER_TOGGLE_VISIBILITY )
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
    
    FormMosaicPreview.reset()
    FormMosaicRetrieve.reset()
}

module.exports = {
    init      : init
    , collapse: collapse
    , reset   : reset
}