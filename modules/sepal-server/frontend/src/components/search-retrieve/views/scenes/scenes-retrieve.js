/**
 * @author Mino Togna
 */
require( './scenes-retrieve.scss' )

var EventBus    = require( '../../../event/event-bus' )
var Events      = require( '../../../event/events' )
var BudgetCheck = require( '../../../budget-check/budget-check' )

var parentContainer = null
var template        = require( './scenes-retrieve.html' )
var html            = $( template( {} ) )
var scenesNo        = null


var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.scenes-retrieve' )
    container.append( html )
    
    scenesNo   = container.find( '.scenes-number' )
    var btnYes = container.find( '.btn-yes' )
    var btnNo  = container.find( '.btn-no' )
    
    btnYes.click( function ( e ) {
        e.preventDefault()
        
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES )
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
        setTimeout( function () {
            EventBus.dispatch( Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager' )
        }, 100 )
    } )
    
    btnNo.click( function ( e ) {
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

var setScenesNumber = function ( noScenes ) {
    scenesNo.html( noScenes )
}

module.exports = {
    init              : init
    , hide            : hide
    , toggleVisibility: toggleVisibility
    , setScenesNumber : setScenesNumber
}