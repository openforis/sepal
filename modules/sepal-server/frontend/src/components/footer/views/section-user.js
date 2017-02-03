/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var UserMV   = require( '../../user/user-mv' )

var btnUser   = null
var btnLogout = null

var init      = function ( container ) {
    container = $( container )
    
    btnUser   = container.find( ".btn-user" )
    btnLogout = container.find( ".btn-logout" )
    
    btnUser.find( '.username' ).html( UserMV.getCurrentUser().username )
    btnUser.click( function ( e ) {
        e.preventDefault()
        
        EventBus.dispatch( Events.SECTION.NAV_MENU.COLLAPSE )
        EventBus.dispatch( Events.SECTION.SHOW, null, "user" )
    } )
    
    btnLogout.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.AJAX.REQUEST, null, { url: "/logout" } )
        EventBus.dispatch( Events.USER.LOGGED_OUT )
    } )
}


module.exports = {
    init: init
}