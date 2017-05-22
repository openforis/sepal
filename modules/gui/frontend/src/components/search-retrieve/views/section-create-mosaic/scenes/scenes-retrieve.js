/**
 * @author Mino Togna
 */
require( './scenes-retrieve.scss' )

var EventBus           = require( '../../../../event/event-bus' )
var Events             = require( '../../../../event/events' )
var Model              = require( '../../../../search/model/search-model' )
var SearchRequestUtils = require( '../../../../search/search-request-utils' )
var BudgetCheck        = require( '../../../../budget-check/budget-check' )

var parentContainer = null
var template        = require( './scenes-retrieve.html' )
var html            = $( template( {} ) )
var elemScenesNo    = null

var state = {}

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.scenes-retrieve' )
    container.append( html )
    
    elemScenesNo = container.find( '.scenes-number' )
    
    container.find( '.btn-retrieve-scenes' ).click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES, null, state )
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
        setTimeout( function () {
            EventBus.dispatch( Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager' )
        }, 100 )
    } )
    
    container.find( '.btn-cancel' ).click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
    } )
}

var setActiveState = function ( e, activeState ) {
    state = activeState
    if ( state.type == Model.TYPES.MOSAIC ) {
        var sceneIds = SearchRequestUtils.addSceneIds( state, {} )
        elemScenesNo.html( sceneIds.length + ' ' + state.sensorGroup + ' ' )
    }
}
EventBus.addEventListener( Events.SECTION.SEARCH.MODEL.ACTIVE_CHANGED, setActiveState )

var hide = function ( options ) {
    parentContainer.velocitySlideUp( options )
}

var toggleVisibility = function ( options ) {
    options = $.extend( {}, {
        begin: function ( elements ) {
            BudgetCheck.check( html )
        }
    }, options )
    parentContainer.velocitySlideToggle( options )
}

module.exports = {
    init              : init
    , setActiveState  : setActiveState
    , hide            : hide
    , toggleVisibility: toggleVisibility
}