/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var User     = require( './user-m' )

var userDetailsLoaded = function ( e , userDetails ) {
    User.setUserDetails( userDetails )
}

EventBus.addEventListener( Events.USER.USER_DETAILS_LOADED, userDetailsLoaded )