/**
 * @author Mino Togna
 */

require( './user.scss' )

var moment = require( 'moment' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Sepal    = require( '../main/sepal' )

var template          = require( './user.html' )
var html              = $( template( {} ) )
// UI components
var sessionsSection   = null
var rowSessionSection = null
var resourcesSection  = null

var init = function () {
    var appSection = $( '#app-section' ).find( '.user' )
    
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        sessionsSection   = html.find( '.sessions' )
        rowSessionSection = html.find( '.row-session-placeholder' )
        resourcesSection  = html.find( '.resources' )
    }
    
}

var setSessions = function ( sessions ) {
    sessionsSection.find( '.row-session' ).remove()
    
    $.each( sessions, function ( i, session ) {
        var row = rowSessionSection.clone()
        row.removeClass( 'row-session-placeholder' ).addClass( 'row-session' )
        
        row.find( '.type' ).html( session.instanceType.name )
        var creationTimeFromNow = moment( session.creationTime, "YYYY-MM-DD[T]HH:mm:ss" ).fromNow()
        row.find( '.time' ).html( creationTimeFromNow )
        row.find( '.cost' ).html( session.costSinceCreation + " USD " )
        
        sessionsSection.append( row )
        setTimeout( function () {
            row.fadeIn( 200 )
        }, i * 100 )
    } )
}

var setSpending = function ( spending ) {
    resourcesSection.find( '.monthlyInstanceBudget' ).html( spending.monthlyInstanceBudget )
    resourcesSection.find( '.monthlyInstanceSpending' ).html( spending.monthlyInstanceSpending )
    resourcesSection.find( '.monthlyStorageBudget' ).html( spending.monthlyStorageBudget )
    resourcesSection.find( '.monthlyStorageSpending' ).html( spending.monthlyStorageSpending )
    resourcesSection.find( '.storageQuota' ).html( spending.storageQuota + " GB" )
    resourcesSection.find( '.storageUsed' ).html( spending.storageUsed + " GB" )
}

module.exports = {
    init         : init
    , setSessions: setSessions
    , setSpending: setSpending
}