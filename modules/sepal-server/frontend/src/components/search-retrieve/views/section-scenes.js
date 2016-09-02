/**
 * @author Mino Togna
 */
var EventBus             = require( '../../event/event-bus' )
var Events               = require( '../../event/events' )
var ScenesAutoSelectForm = require( './scenes/scenes-autoselection-form-v' )
var MosaicPreviewForm    = require( './mosaic/mosaic-preview-form' )

var html                     = null
var btnRetrieveScenes        = null
var btnBestScenes            = null
var btnToggleLayerVisibility = null

var init = function ( container ) {
    html = container
    
    btnBestScenes            = html.find( '.btn-best-scenes' )
    btnRetrieveScenes        = html.find( '.btn-retrieve-scenes' )
    btnToggleLayerVisibility = html.find( '.btn-hide-scene-areas' )
    
    ScenesAutoSelectForm.init( html.find( '.row-best-scenes-form' ) )
    
    initEventHandlers()
    reset()
}

var initEventHandlers = function () {
    
    btnBestScenes.click( function ( e ) {
        e.preventDefault()
        MosaicPreviewForm.hide()
        ScenesAutoSelectForm.toggleVisibility()
    } )
    
    btnRetrieveScenes.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES )
    } )
    
    
    btnToggleLayerVisibility.click( function ( e ) {
        e.preventDefault()
        btnToggleLayerVisibility.toggleClass( 'active' )
        EventBus.dispatch( Events.MAP.SCENE_AREA_TOGGLE_VISIBILITY )
    } )
    
}

var collapse = function ( options ) {
    ScenesAutoSelectForm.hide( options )
}

var reset = function () {
    collapse( { delay: 0, duration: 0 } )
    ScenesAutoSelectForm.reset()
}

module.exports = {
    init                  : init
    , collapse            : collapse
    , reset               : reset
    // Scenes auto selection form set value methods
    , setSortWeight       : ScenesAutoSelectForm.setSortWeight
    , setOffsetToTargetDay: ScenesAutoSelectForm.setOffsetToTargetDay
    , setSelectedSensors  : ScenesAutoSelectForm.setSelectedSensors
}