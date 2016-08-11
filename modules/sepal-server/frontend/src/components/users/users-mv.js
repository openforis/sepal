/**
 * @author Mino Togna
 */

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var View      = require( './users-v' )
var UserMV      = require( '../user/user-mv' )
var NavMenu   = require( '../nav-menu/nav-menu' )
var Animation = require( '../animation/animation' )

var initialized = false

var init = function () {
    
    if ( !initialized ) {
        if ( UserMV.getCurrentUser().isAdmin() ) {
            Animation.animateIn( NavMenu.btnUsers() )
            View.init()
            
            loadUsers()
        }
        initialized = true
    }
    
}

var loadUsers = function () {
    var params = {
        url : '/api/users'
        , success : function ( response ) {
            console.log( response )
        }
    }   
}

EventBus.addEventListener( Events.SECTION.NAV_MENU.LOADED, init )

