/**
 * @author Mino Togna
 */

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var UserModel = require( './user-m' )
var Loader    = require( '../loader/loader' )
var View      = require( './user-v' )

var loadUserSanboxIntervalId = null
var viewInitialized          = false

var CurrentUser = null

var userDetailsLoaded = function ( e, userDetails ) {
    CurrentUser = UserModel( userDetails )
    
    if ( loadUserSanboxIntervalId ) {
        stopJob()
    }
    loadUserSandbox()
    // loadUserSanboxIntervalId = setInterval( loadUserSandbox, 1000 * 60 )
}

var loadUserSandbox = function () {
    var params = {
        url      : '/api/sandbox/report'
        , success: function ( response ) {
            CurrentUser.setUserSandboxReport( response )
            
            if ( viewInitialized ) {
                View.updateUserSandbox( CurrentUser )
            }
            
            EventBus.dispatch( Events.USER.USER_SANDBOX_REPORT_LOADED, null, CurrentUser )
            
            
            loadUserSanboxIntervalId = setTimeout( function () {
                loadUserSandbox()
            }, 60000 )
        }
        , error  : function () {}
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var stopJob = function () {
    clearInterval( loadUserSanboxIntervalId )
    loadUserSanboxIntervalId = null
}

var getCurrentUser = function () {
    return CurrentUser
}

var show = function ( e, type ) {
    if ( type == 'user' ) {
        View.init()
        View.setUser( CurrentUser )
        
        viewInitialized = true
    }
}

var removeSession = function ( evt, sessionId ) {
    var session = CurrentUser.getSessionById( sessionId )
    
    var params = {
        url         : '/api/' + session.path
        , method    : 'DELETE'
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            View.removeSession( sessionId )
            
            Loader.hide( { delay: 200 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var onPasswordChanged = function ( e ) {
    View.showEditUserDetailsForm()
}

var reloadUserDetails = function ( e ) {
    var params = {
        url      : '/user/current'
        , success: function ( response ) {
            userDetailsLoaded( null, response )
        }
    }
    EventBus.dispatch( Events.AJAX.GET, null, params )
}

// section events
EventBus.addEventListener( Events.SECTION.SHOW, show )

//user loaded
EventBus.addEventListener( Events.USER.USER_DETAILS_LOADED, userDetailsLoaded )
EventBus.addEventListener( Events.USER.PASSWORD_CHANGED, onPasswordChanged )
// sandbox edit events
EventBus.addEventListener( Events.SECTION.USER.REMOVE_SESSION, removeSession )
// reload user details
EventBus.addEventListener( Events.USER.RELOAD_USER_DETAILS, reloadUserDetails )

EventBus.addEventListener( Events.APP.DESTROY, stopJob )

module.exports = {
    getCurrentUser: getCurrentUser
}

