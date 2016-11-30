/**
 * @author Mino Togna
 */
require( './footer.scss' )

var EventBus       = require( '../event/event-bus' )
var Events         = require( '../event/events' )
var UserMV         = require( '../user/user-mv' )
var DashboardLinks = require( './views/dashboard-links-v' )

var html      = null
var Logo      = null
var BtnUser   = null
var BtnLogout = null

var init = function () {
    var template = require( './footer.html' )
    html         = $( template( {} ) )
    
    var footer = $( '.app' ).find( 'footer' )
    if ( footer.children().length <= 0 ) {
        $( '.app' ).append( html )
        
        DashboardLinks.init( html.find( '.dashboard-links' ) )
        
        Logo      = html.find( ".sepal-logo" )
        BtnUser   = html.find( ".btn-user" )
        BtnLogout = html.find( ".btn-logout" )
        
        BtnUser.find( '.username' ).html( UserMV.getCurrentUser().username )
        BtnUser.click( function ( e ) {
            e.preventDefault()
            
            EventBus.dispatch( Events.SECTION.NAV_MENU.COLLAPSE )
            EventBus.dispatch( Events.SECTION.SHOW, null, "user" )
        } )
        
        BtnLogout.click( function ( e ) {
            e.preventDefault()
            EventBus.dispatch( Events.AJAX.REQUEST, null, { url: "/logout" } )
            EventBus.dispatch( Events.USER.LOGGED_OUT )
        } )
    }
}

var hide = function () {
    html.velocity( { bottom: '-7%' }, { delay: 200, duration: 1200, easing: 'easeOutQuint' } )
}

var show = function () {
    html.velocity( { bottom: '0' }, { delay: 1000, duration: 1500, easing: 'easeOutQuint' } )
}

var showLogo = function () {
    $.each( Logo.find( 'div' ), function ( i, e ) {
        var elem = $( this )
        elem.velocity( "fadeIn", { display: "inline-block", delay: i * 1000, easing: 'swing' } )
    } )
}

module.exports = {
    init         : init
    , show       : show
    , hide       : hide
    , showLogo   : showLogo
    , updateTasks: DashboardLinks.updateTasks
}