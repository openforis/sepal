/**
 * @author Mino Togna
 */
var EventBus                = require( '../../event/event-bus' )
var Events                  = require( '../../event/events' )
var FormScenesAutoSelection = require( './scenes/form-scenes-autoselection-form' )
var FormMosaicPreview       = require( './mosaic/form-mosaic-preview' )
var FormMosaicRetrieve      = require( './mosaic/form-mosaic-retrieve' )

var html                     = null
var btnRetrieveScenes        = null
var btnBestScenes            = null
var btnToggleLayerVisibility = null

var init = function ( container ) {
    html = container
    
    btnBestScenes            = html.find( '.btn-best-scenes' )
    btnRetrieveScenes        = html.find( '.btn-retrieve-scenes' )
    btnToggleLayerVisibility = html.find( '.btn-hide-scene-areas' )
    
    FormScenesAutoSelection.init( html.find( '.row-best-scenes-form' ) )
    
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
        FormScenesAutoSelection.toggleVisibility()
    } )
    
    btnRetrieveScenes.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES )
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
        setTimeout( function (  ) {
            EventBus.dispatch(Events.ALERT.SHOW_INFO , null , 'The download will start shortly.<br/>You can monitor the progress in the task manager')
        } , 100 )
    } )
    
    
    btnToggleLayerVisibility.click( function ( e ) {
        e.preventDefault()
        btnToggleLayerVisibility.toggleClass( 'active' )
        EventBus.dispatch( Events.MAP.SCENE_AREA_TOGGLE_VISIBILITY )
    } )
    
}

var collapse = function ( options ) {
    btnBestScenes.removeClass( 'active' )
    FormScenesAutoSelection.hide( options )
}

var reset = function () {
    collapse( { delay: 0, duration: 0 } )
    FormScenesAutoSelection.reset()
}

module.exports = {
    init                  : init
    , collapse            : collapse
    , reset               : reset
    // Scenes auto selection form set value methods
    , setSortWeight       : FormScenesAutoSelection.setSortWeight
    , setOffsetToTargetDay: FormScenesAutoSelection.setOffsetToTargetDay
    , setSelectedSensors  : FormScenesAutoSelection.setSelectedSensors
}