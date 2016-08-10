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
//
var userDetailForm    = null

var init = function () {
    var appSection = $( '#app-section' ).find( '.user' )
    
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        sessionsSection   = html.find( '.sessions' )
        rowSessionSection = html.find( '.row-session-placeholder' )
        resourcesSection  = html.find( '.resources' )
        
        userDetailForm = html.find( '#user-detail-form' )
        initForm()
    }
    
}

var initForm = function () {
    
    var formNotify = userDetailForm.find( '.form-notify' )
    
    var showError = function ( message ) {
        // formNotify.html( message )
        formNotify.velocitySlideDown( {
            delay: 0, duration: 500, begin: function () {
                formNotify.html( message )
            }
        } )
    }
    
    var validString = function ( field, message ) {
        if ( $.isEmptyString( field.val() ) ) {
            field.closest( '.form-group' ).addClass( 'error' )
            showError( message )
            return false
        }
        return true
    }
    var validEmail  = function ( field ) {
        var re = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i
        
        if ( !re.test( field.val() ) ) {
            field.closest( '.form-group' ).addClass( 'error' )
            showError( "Email is not valid" )
            return false
        }
        return true
    }
    
    
    userDetailForm.submit( function ( e ) {
        formNotify.velocitySlideUp( { delay: 0, duration: 100 } )
        userDetailForm.find( '.form-group' ).removeClass( 'error' )
        
        e.preventDefault()
        
        var name         = userDetailForm.find( '[name=name]' )
        var username     = userDetailForm.find( '[name=username]' )
        var password     = userDetailForm.find( '[name=password]' )
        var email        = userDetailForm.find( '[name=email]' )
        var organization = userDetailForm.find( '[name=organization]' )
        
        var valid = false
        if ( validString( name, 'Name cannot be empty' ) ) {
            if ( validString( username, 'Username cannot be empty' ) ) {
                if ( validString( password, 'Password cannot be empty' ) ) {
                    if ( validString( email, 'Email cannot be empty' ) ) {
                        if ( validEmail( email ) ) {
                            if ( validString( organization, 'Organization cannot be empty' ) ) {
                                valid = true
                            }
                        }
                    }
                }
            }
        }
        
        if ( valid ) {
            // submit
            var data = userDetailForm.serialize()
            EventBus.dispatch( Events.SECTION.USER.SAVE_USER_DETAIL, null, data )
        }
        
    } )
}

var setSessions = function ( sessions ) {
    sessionsSection.find( '.row-session' ).remove()
    
    $.each( sessions, function ( i, session ) {
        var row = rowSessionSection.clone()
        row.removeClass( 'row-session-placeholder' ).addClass( 'row-session ' + session.id )
        
        row.find( '.type' ).html( session.instanceType.name )
        var creationTimeFromNow = moment( session.creationTime, "YYYY-MM-DD[T]HH:mm:ss" ).fromNow()
        row.find( '.time' ).html( creationTimeFromNow )
        row.find( '.cost' ).html( session.costSinceCreation + " USD " )
        
        row.find( '.btn-remove' ).click( function ( e ) {
            EventBus.dispatch( Events.SECTION.USER.REMOVE_SESSION, null, session.id )
        } )
        
        sessionsSection.append( row )
        setTimeout( function () {
            row.fadeIn( 200 )
        }, i * 100 )
    } )
}

var removeSession = function ( sessionId ) {
    var sessionRow = sessionsSection.find( '.' + sessionId )
    sessionRow.fadeOut( {
        complete: function () {
            sessionRow.remove()
        }
    } )
}

var setSpending = function ( spending ) {
    resourcesSection.find( '.monthlyInstanceBudget' ).html( spending.monthlyInstanceBudget.toFixed( 2 ) + " USD" )
    resourcesSection.find( '.monthlyInstanceSpending' ).html( spending.monthlyInstanceSpending.toFixed( 2 ) + " USD" )
    resourcesSection.find( '.monthlyStorageBudget' ).html( spending.monthlyStorageBudget.toFixed( 2 ) + " USD" )
    resourcesSection.find( '.monthlyStorageSpending' ).html( spending.monthlyStorageSpending.toFixed( 2 ) + " USD" )
    resourcesSection.find( '.storageQuota' ).html( spending.storageQuota.toFixed( 2 ) + " GB" )
    resourcesSection.find( '.storageUsed' ).html( (spending.storageUsed).toFixed( 2 ) + " GB" )
}

var setUserDetails = function ( userDetails ) {
    userDetailForm.find( '[name=name]' ).val( userDetails.name )
    userDetailForm.find( '[name=username]' ).val( userDetails.username )
    userDetailForm.find( '[name=password]' ).val( userDetails.password )
    userDetailForm.find( '[name=email]' ).val( userDetails.email )
    userDetailForm.find( '[name=organization]' ).val( userDetails.organization )
}

module.exports = {
    init            : init
    , setSessions   : setSessions
    , setSpending   : setSpending
    , removeSession : removeSession
    , setUserDetails: setUserDetails
}