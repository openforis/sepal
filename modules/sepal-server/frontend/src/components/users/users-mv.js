/**
 * @author Mino Togna
 */

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var View      = require( './users-v' )
var User      = require( '../main/user-m' )
var NavMenu   = require( '../nav-menu/nav-menu' )
var Animation = require( '../animation/animation' )

var initialized = false

var init = function () {
    
    if ( !initialized ) {
        if ( User.isAdmin() ) {
            Animation.animateIn( NavMenu.btnUsers() )
            View.init()
        }
        initialized = true
    }
    
}

EventBus.addEventListener( Events.SECTION.NAV_MENU.LOADED, init )

