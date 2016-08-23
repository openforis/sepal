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
        url      : '/api/user'
        , success: function ( response ) {
            EventBus.dispatch( Events.APP.USER_LOGGED_IN, null, response )
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

// checkUser()

var initApp = function () {
    var inviteParam = $.urlParam( 'i' )
    console.log( inviteParam )
    checkUser()
}

initApp()

// event handlers
EventBus.addEventListener( Events.APP.USER_LOGGED_IN, userLoggedIn )
