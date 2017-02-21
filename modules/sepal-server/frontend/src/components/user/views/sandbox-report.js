/**
 * @author Mino Togna
 */
var moment  = require( 'moment' )
var numeral = require( 'numeral' )

var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Resources  = null
var Sessions   = null
var RowSession = null

var init = function ( resources, sessions ) {
    Resources  = $( resources )
    Sessions   = $( sessions )
    RowSession = Sessions.find( '.row-session-placeholder' )
}

var setSessions = function ( sessions ) {
    Sessions.find( '.row-session' ).remove()
    
    $.each( sessions, function ( i, session ) {
        var row = RowSession.clone()
        row.removeClass( 'row-session-placeholder' ).addClass( 'row-session ' + session.id )
        
        row.find( '.type' ).html( session.instanceType.name )
        var creationTimeFromNow = moment( session.creationTime + ' +0000', "YYYY-MM-DD[T]HH:mm:ss Z" ).fromNow()
        row.find( '.time' ).html( creationTimeFromNow )
        row.find( '.cost' ).html( session.costSinceCreation + " USD " )
        
        row.find( '.btn-remove' ).click( function ( e ) {
            EventBus.dispatch( Events.SECTION.USER.REMOVE_SESSION, null, session.id )
        } )
        
        Sessions.append( row )
        setTimeout( function () {
            row.fadeIn( 200 )
        }, i * 100 )
    } )
}

var removeSession = function ( sessionId ) {
    var sessionRow = Sessions.find( '.' + sessionId )
    sessionRow.fadeOut( {
        complete: function () {
            sessionRow.remove()
        }
    } )
}

var setSpending = function ( spending ) {
    Resources.find( '.monthlyInstanceBudget' ).html( numeral( spending.monthlyInstanceBudget ).format( '0.[00]' ) + " USD" )
    Resources.find( '.monthlyInstanceSpending' ).html( numeral( spending.monthlyInstanceSpending ).format( '0.[00]' ) + " USD" )
    Resources.find( '.monthlyStorageBudget' ).html( numeral( spending.monthlyStorageBudget ).format( '0.[00]' ) + " USD" )
    Resources.find( '.monthlyStorageSpending' ).html( numeral( spending.monthlyStorageSpending ).format( '0.[00]' ) + " USD" )
    Resources.find( '.storageQuota' ).html( numeral( spending.storageQuota ).format( '0.[00]' ) + " GB" )
    Resources.find( '.storageUsed' ).html( numeral( spending.storageUsed ).format( '0.[00]' ) + " GB" )
}

module.exports = {
    init           : init
    , setSessions  : setSessions
    , removeSession: removeSession
    , setSpending  : setSpending
}