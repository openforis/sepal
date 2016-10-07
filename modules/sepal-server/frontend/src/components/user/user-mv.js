/**
 * @author Mino Togna
 */

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var UserModel = require( './user-m' )
var Loader    = require( '../loader/loader' )
var View      = require( './user-v' )

var CurrentUser = null

var userDetailsLoaded = function ( e, userDetails ) {
    CurrentUser = UserModel( userDetails )
}

var getCurrentUser = function () {
    return CurrentUser
}

var show = function ( e, type ) {
    if ( type == 'user' ) {
        View.init()
        
        var params = {
            url      : '/api/sandbox/report'
            , success: function ( response ) {
                CurrentUser.setUserSandboxReport( response )
                
                View.setUser( CurrentUser )
            }
        }
        
        EventBus.dispatch( Events.AJAX.REQUEST, null, params )
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

// var saveUserDetail = function ( e, data ) {
//     var params = {
//         url         : '/api/user/details'
//         , beforeSend: function () {
//             Loader.show()
//         }
//         , success   : function ( response ) {
//             Loader.hide( { delay: 200 } )
//             EventBus.dispatch( Events.USER.USER_DETAILS_LOADED, null, response )
//
//         }
//     }
//     EventBus.dispatch( Events.AJAX.POST, null, params )
// }

var onPasswordChanged = function ( e ) {
    View.showEditUserDetailsForm()
}


// section events
EventBus.addEventListener( Events.SECTION.SHOW, show )

//user loaded
EventBus.addEventListener( Events.USER.USER_DETAILS_LOADED, userDetailsLoaded )
EventBus.addEventListener( Events.USER.PASSWORD_CHANGED, onPasswordChanged )

// user edit events
// EventBus.addEventListener( Events.SECTION.USER.SAVE_USER_DETAILS, saveUserDetail )
// EventBus.addEventListener( Events.SECTION.USER.CHANGE_PASSWORD, changePassword )

// sandbox edit events
EventBus.addEventListener( Events.SECTION.USER.REMOVE_SESSION, removeSession )


module.exports = {
    getCurrentUser: getCurrentUser
}

