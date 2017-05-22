/**
 * @author Mino Togna
 */
var EventBus                = require( '../../../event/event-bus' )
var Events                  = require( '../../../event/events' )
var FormScenesAutoSelection = require( './scenes/form-scenes-autoselection-form' )
var ScenesRetrieve          = require( './scenes/scenes-retrieve' )
var FormMosaicPreview       = require( './mosaic/form-mosaic-preview' )
var FormMosaicRetrieve      = require( './mosaic/form-mosaic-retrieve' )

var html                     = null
var btnRetrieveScenes        = null
var btnBestScenes            = null
var btnToggleLayerVisibility = null

var state = {}

var init = function ( container ) {
    html = container
    
    btnBestScenes            = html.find( '.btn-best-scenes' )
    btnRetrieveScenes        = html.find( '.btn-retrieve-scenes' )
    btnToggleLayerVisibility = html.find( '.btn-hide-scene-areas' )
    
    FormScenesAutoSelection.init( html.find( '.row-best-scenes-form' ) )
    ScenesRetrieve.init( html.find( '.row-scenes-retrieve' ) )
    
    initEventHandlers()
    collapse( { delay: 0, duration: 0 } )
}

var initEventHandlers = function () {
    
    btnBestScenes.click( function () {
        FormMosaicPreview.hide()
        FormMosaicRetrieve.hide()
        ScenesRetrieve.hide()
        FormScenesAutoSelection.toggleVisibility()
    } )
    
    btnRetrieveScenes.click( function () {
        FormMosaicPreview.hide()
        FormMosaicRetrieve.hide()
        FormScenesAutoSelection.hide()
        ScenesRetrieve.toggleVisibility()
    } )
    
    btnToggleLayerVisibility.click( function () {
        btnToggleLayerVisibility.toggleClass( 'active' )
        
        if ( btnToggleLayerVisibility.hasClass( 'active' ) ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.SHOW_SCENE_AREAS )
        } else {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.HIDE_SCENE_AREAS )
        }
    } )
    
}

var setActiveState = function ( e, activeState ) {
    state = activeState
}
EventBus.addEventListener( Events.SECTION.SEARCH.MODEL.ACTIVE_CHANGED, setActiveState )

var collapse = function ( options ) {
    btnBestScenes.removeClass( 'active' )
    btnRetrieveScenes.removeClass( 'active' )
    
    FormScenesAutoSelection.hide( options )
    ScenesRetrieve.hide( options )
}

var reset = function () {
    collapse( { delay: 0, duration: 0 } )
    btnToggleLayerVisibility.addClass( 'active' )
}

module.exports = {
    init      : init
    , collapse: collapse
    , reset   : reset
}