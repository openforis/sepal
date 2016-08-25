/**
 * @author Mino Togna
 */
require( './footer.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var template = require( './footer.html' )
var html     = null

var Logo = null

var init = function () {
    html = $( template( {} ) )
    EventBus.dispatch( Events.APP.REGISTER_ELEMENT, null, html.attr( 'id' ) )
    
    var footer = $( '.app' ).find( 'footer' )
    if ( footer.children().length <= 0 ) {
        $( '.app' ).append( html )
        Logo = html.find( ".sepal-logo" )
    }
}

var hide = function () {
    html.velocity( { bottom: '-7%' }, { delay: 200, duration: 1200, easing: 'easeOutQuint' } )
}

var show = function () {
    html.velocity( { bottom: '0' }, { delay: 1000, duration: 1000, easing: 'easeOutQuint' } )
}

var showLogo = function () {
    $.each( Logo.find( 'div' ), function ( i, e ) {
        var elem = $( this )
        elem.velocity( "fadeIn", { display: "inline-block", delay: i * 1000, easing: 'swing' } )
    } )
}

module.exports = {
    init      : init
    , show    : show
    , hide    : hide
    , showLogo: showLogo
}