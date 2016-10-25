/**
 * @author Mino Togna
 */
var moment = require( 'moment' )

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
    Resources.find( '.monthlyInstanceBudget' ).html( spending.monthlyInstanceBudget.toFixed( 2 ) + " USD" )
    Resources.find( '.monthlyInstanceSpending' ).html( spending.monthlyInstanceSpending.toFixed( 2 ) + " USD" )
    Resources.find( '.monthlyStorageBudget' ).html( spending.monthlyStorageBudget.toFixed( 2 ) + " USD" )
    Resources.find( '.monthlyStorageSpending' ).html( spending.monthlyStorageSpending.toFixed( 2 ) + " USD" )
    Resources.find( '.storageQuota' ).html( spending.storageQuota.toFixed( 2 ) + " GB" )
    Resources.find( '.storageUsed' ).html( (spending.storageUsed).toFixed( 2 ) + " GB" )
}

module.exports = {
    init           : init
    , setSessions  : setSessions
    , removeSession: removeSession
    , setSpending  : setSpending
}