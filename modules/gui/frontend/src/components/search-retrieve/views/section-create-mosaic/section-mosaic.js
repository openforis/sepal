/**
 * @author Mino Togna
 */
var EventBus                = require( '../../../event/event-bus' )
var Events                  = require( '../../../event/events' )
var FormMosaicPreview       = require( './mosaic/form-mosaic-preview' )
var FormMosaicRetrieve      = require( './mosaic/form-mosaic-retrieve' )
var FormScenesAutoSelection = require( './scenes/form-scenes-autoselection-form' )
var FormScenesRetrieve      = require( './scenes/scenes-retrieve' )

var html                = null
var btnPreviewMosaic    = null
var btnRetrieveMosaic   = null
var btnToggleVisibility = null

var state = {}

var init = function ( container ) {
    html = container
    
    btnPreviewMosaic    = html.find( '.btn-preview-mosaic' )
    btnRetrieveMosaic   = html.find( '.btn-retrieve-mosaic' )
    btnToggleVisibility = html.find( '.btn-toggle-mosaic-visibility' )
    
    FormMosaicPreview.init( html.find( '.row-mosaic-preview' ) )
    FormMosaicRetrieve.init( html.find( '.row-mosaic-retrieve' ) )
    
    initEventHandlers()
    reset()
}

var initEventHandlers = function () {
    
    btnPreviewMosaic.click( function () {
        FormMosaicPreview.toggleVisibility()
        FormScenesAutoSelection.hide()
        FormScenesRetrieve.hide()
        FormMosaicRetrieve.hide()
    } )
    
    btnRetrieveMosaic.click( function () {
        FormMosaicPreview.hide()
        FormScenesAutoSelection.hide()
        FormScenesRetrieve.hide()
        FormMosaicRetrieve.toggleVisibility()
    } )
    
    btnToggleVisibility.click( function ( e ) {
        btnToggleVisibility.toggleClass( 'active' )
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.TOGGLE_MOSAIC_VISIBILITY )
    } )
    
}

var setActiveState = function ( e, activeState ) {
    state = activeState
    if ( state.mosaicPreviewBand ) {
        btnToggleVisibility.enable()
    } else {
        btnToggleVisibility.disable()
    }
}

EventBus.addEventListener( Events.SECTION.SEARCH.MODEL.ACTIVE_CHANGED, setActiveState )

EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.MOSAIC_LOADED, function () {
    btnToggleVisibility.addClass( 'active' )
} )

var collapse = function ( options ) {
    btnPreviewMosaic.removeClass( 'active' )
    btnRetrieveMosaic.removeClass( 'active' )
    
    FormMosaicPreview.hide( options )
    FormMosaicRetrieve.hide( options )
}

var reset = function () {
    collapse( { delay: 0, duration: 0 } )
    btnToggleVisibility.removeClass( 'active' )
    
    FormMosaicPreview.reset()
    FormMosaicRetrieve.reset()
}

module.exports = {
    init      : init
    , collapse: collapse
    , reset   : reset
}