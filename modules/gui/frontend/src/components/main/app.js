// common modules
require( './app-required-modules' )

var Loader   = require( '../loader/loader' )
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
landing
var userLoggedIn = function ( e, user ) {
    EventBus.dispatch( Events.USER.USER_DETAILS_LOADED, null, user )
    load()
}

var load = function () {
    Loader.show()
    setTimeout( function () {
        
        EventBus.dispatch( Events.LOGIN.HIDE )
        EventBus.dispatch( Events.APP.LOAD )
        
        Loader.hide()
        
    }, 2000 )
}

var checkUser = function () {
    var params = {
        url      : '/user/current'
        , success: function ( response ) {
            EventBus.dispatch( Events.APP.USER_LOGGED_IN, null, response )
        }
        , error  : function ( xhr, ajaxOptions, thrownError ) {
            EventBus.dispatch( Events.LOGIN.SHOW )
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var validateToken = function ( token, callback ) {
    var params = {
        url      : '/user/validate-token'
        , data   : { token: token }
        , success: function ( response ) {
            callback( response )
        }
    }
    EventBus.dispatch( Events.AJAX.POST, null, params )
}

var init = function () {
    var token = $.urlParam( 'token' )
    
    if ( token ) {
        validateToken( token, function ( tokenStatus ) {
            if ( tokenStatus.status == 'success' ) {
                tokenStatus.invitation = $.urlParam( 'invitation' ) === 'true'
                history.replaceState( null, $( document ).find( "title" ).text(), '/' )
                EventBus.dispatch( Events.LOGIN.SHOW, null, tokenStatus )
            } else
                EventBus.dispatch( Events.LOGIN.SHOW )
            
        } )
        
        Loader.hide( { delay: 200 } )
    } else {
        
        checkUser()
        
    }
    
}

var destroy = function () {
    location.reload()
}

init()

// app events
EventBus.addEventListener( Events.APP.DESTROY, destroy )
EventBus.addEventListener( Events.USER.LOGGED_OUT, destroy )

// event handlers
EventBus.addEventListener( Events.APP.USER_LOGGED_IN, userLoggedIn )
