// common modules
require( './app-required-modules' )

var Loader   = require( '../loader/loader' )
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var userLoggedIn = function ( e, user ) {
    EventBus.dispatch( Events.USER.USER_DETAILS_LOADED, null, user )
    loadApp()
}

var loadApp = function () {
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

var initApp = function () {
    var token = $.urlParam( 'token' )
    
    if ( token ) {
        validateToken( token, function ( tokenStatus ) {
            if ( tokenStatus.status == 'success' ) {
                tokenStatus.invitation = $.urlParam( 'invitation' ) === 'true'
                EventBus.dispatch( Events.LOGIN.SHOW, null, tokenStatus )
            } else
                EventBus.dispatch( Events.LOGIN.SHOW )
            
        } )
        
        Loader.hide( { delay: 200 } )
    } else {
        
        checkUser()
        
    }
    
}

initApp()

var registeredElements = []
var onRegisterElement  = function ( e, id ) {
    registeredElements.push( id )
}

var onAppDestroy = function () {
    Loader.show()
    $.each( registeredElements, function ( i, id ) {
        $( '#' + id ).remove()
    } )
    registeredElements = []
    
    EventBus.dispatch( Events.LOGIN.SHOW )
    
    Loader.hide( { delay: 1000 } )
}

// app events
EventBus.addEventListener( Events.APP.DESTROY, onAppDestroy )
EventBus.addEventListener( Events.APP.REGISTER_ELEMENT, onRegisterElement )

// event handlers
EventBus.addEventListener( Events.APP.USER_LOGGED_IN, userLoggedIn )
