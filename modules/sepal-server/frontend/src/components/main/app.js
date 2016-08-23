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

var initApp = function () {
    var inviteParam = $.urlParam( 'i' )
    
    if ( inviteParam ) {
        Loader.show()
        // console.log( inviteParam )
        // var params = {
        //     url : '/api/user/invite'
        //     , data : { i : inviteParam }
        //     , success : function ( response ) {
        //         var invitationId = response.invitationId
        //         if( invitationId ){
        //             //user clicked on an invitation link.
        //             EventBus.dispatch( Events.LOGIN.SHOW , null , response )
        //         } else {
        //             checkUser()
        //         }
        //     }
        // }
        
        // TODO: simulating now
        var response = {
            invitationId : 2341423
            , userId    : 1234
            , username: 'trest'
        }
        EventBus.dispatch( Events.LOGIN.SHOW, null, response )
        Loader.hide( { delay: 200 } )
    } else {
        
        checkUser()
        
    }
    
}

initApp()

// event handlers
EventBus.addEventListener( Events.APP.USER_LOGGED_IN, userLoggedIn )
