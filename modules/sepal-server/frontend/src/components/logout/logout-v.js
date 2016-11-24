/**
 * @author Mino Togna
 */
require( './logout.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var UserMV   = require( '../user/user-mv' )

var html      = null
var btnLogout = null

var init = function () {
    var template = require( './logout.html' )
    html         = $( template( {} ) )
    
    var id = html.attr( 'id' )
    EventBus.dispatch( Events.APP.REGISTER_ELEMENT, null, id )
    
    btnLogout = html.find( '.btn-logout' )
    
    var logout = $( '.app' ).find( '#' + id )
    if ( logout.children().length <= 0 ) {
        html.velocitySlideUp( { delay: 0, duration: 0 } )
        $( '.app' ).append( html )
        
        btnLogout.html( '<i class="fa fa-sign-out" aria-hidden="true"></i> ' + UserMV.getCurrentUser().username )
        
        btnLogout.click( function ( e ) {
            e.preventDefault()
            EventBus.dispatch( Events.AJAX.REQUEST, null, { url: "/logout" } )
            EventBus.dispatch( Events.USER.LOGGED_OUT )
        } )
    }
    
}

var shown = false
var show  = function () {
    if ( !shown ) {
        shown = true
        html.velocitySlideDown( { delay: 1000, duration: 1000 } )
    }
}

var hide = function () {
    shown = false
    html.velocitySlideUp()
}

module.exports = {
    init  : init
    , show: show
    , hide: hide
}