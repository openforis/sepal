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
var rowLandsat                 = null
var rowSentinel2               = null
var elemLandsatScenesNo        = null
var elemSentinel2ScenesNo      = null
var btnRetrieveLandsatScenes   = null
var btnRetrieveSentinel2Scenes = null
var landsatScenesNo            = null
var sentinel2ScenesNo          = null

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.scenes-retrieve' )
    container.append( html )
    
    rowLandsat   = container.find( '.row-landsat' ).hide()
    rowSentinel2 = container.find( '.row-sentinel2' ).hide()
    
    elemLandsatScenesNo   = container.find( '.landsat-scenes-number' )
    elemSentinel2ScenesNo = container.find( '.sentinel2-scenes-number' )
    
    btnRetrieveLandsatScenes   = container.find( '.btn-retrieve-landsat-scenes' )
    btnRetrieveSentinel2Scenes = container.find( '.btn-retrieve-sentinel2-scenes' )
    
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
            BudgetCheck.check( html )
            toggleElements()
        }
    }, options )
    parentContainer.velocitySlideToggle( options )
}

var toggleElements = function () {
    if ( landsatScenesNo > 0 )
        rowLandsat.show()
    else
        rowLandsat.hide()
    elemLandsatScenesNo.html( landsatScenesNo )
    
    if ( sentinel2ScenesNo > 0 )
        rowSentinel2.show()
    else
        rowSentinel2.hide()
    elemSentinel2ScenesNo.html( sentinel2ScenesNo )
}

var setScenesNumber = function ( landsatNoScenes, sentinel2NoScenes ) {
    landsatScenesNo   = landsatNoScenes
    sentinel2ScenesNo = sentinel2NoScenes
    
    toggleElements()
}

module.exports = {
    init              : init
    , hide            : hide
    , toggleVisibility: toggleVisibility
    , setScenesNumber : setScenesNumber
}