/**
 * @author Mino Togna
 */
require( './scenes-retrieve.scss' )

var EventBus    = require( '../../../event/event-bus' )
var Events      = require( '../../../event/events' )
var BudgetCheck = require( '../../../budget-check/budget-check' )

var parentContainer            = null
var template                   = require( './scenes-retrieve.html' )
var html                       = $( template( {} ) )
var landsatScenesNo            = null
var sentinel2ScenesNo          = null
var btnRetrieveLandsatScenes   = null
var btnRetrieveSentinel2Scenes = null

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.scenes-retrieve' )
    container.append( html )
    
    landsatScenesNo   = container.find( '.landsat-scenes-number' )
    sentinel2ScenesNo = container.find( '.sentinel2-scenes-number' )
    
    btnRetrieveLandsatScenes   = container.find( '.btn-retrieve-landsat-scenes' ).hide()
    btnRetrieveSentinel2Scenes = container.find( '.btn-retrieve-sentinel2-scenes' ).hide()
    
    var retrieveScenes = function ( e, evt ) {
        e.preventDefault()
        
        EventBus.dispatch( evt )
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
        setTimeout( function () {
            EventBus.dispatch( Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager' )
        }, 100 )
        
    }
    btnRetrieveLandsatScenes.click( function ( e ) {
        retrieveScenes( e, Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_LANDSAT_SCENES )
    } )
    btnRetrieveSentinel2Scenes.click( function ( e ) {
        retrieveScenes( e, Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SENTINEL2_SCENES )
    } )
    
    var btnCancel = container.find( '.btn-cancel' )
    btnCancel.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
    } )
}

var hide = function ( options ) {
    parentContainer.velocitySlideUp( options )
}

var toggleVisibility = function ( options ) {
    options = $.extend( {}, {
        begin: function ( elements ) {
            // if ( parentContainer.is( ":visible" ) ) {
            BudgetCheck.check( html )
            // }
        }
    }, options )
    parentContainer.velocitySlideToggle( options )
}

var setScenesNumber = function ( landsatNoScenes, sentinel2NoScenes ) {
    if ( landsatNoScenes > 0 )
        btnRetrieveLandsatScenes.show()
    else
        btnRetrieveLandsatScenes.hide()
    landsatScenesNo.html( landsatNoScenes )
    
    if ( sentinel2NoScenes > 0 )
        btnRetrieveSentinel2Scenes.show()
    else
        btnRetrieveSentinel2Scenes.hide()
    sentinel2ScenesNo.html( sentinel2NoScenes )
}

module.exports = {
    init              : init
    , hide            : hide
    , toggleVisibility: toggleVisibility
    , setScenesNumber : setScenesNumber
}