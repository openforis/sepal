/**
 * @author Mino Togna
 */
require( './process.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var html       = null
var $apps      = null
var rStudioImg = require( './img/r-studio.png' )

var init = function () {
    var template = require( './process.html' )
    html         = $( template( {} ) )
    
    var appSection = $( '#app-section' ).find( '.process' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        $apps = html.find( '.apps' )
    }
}

var setApps = function ( apps ) {
    $apps.empty()
    
    var rStudioBtn = $( '<div><button class="btn btn-base app r-studio"><img src="' + rStudioImg + '"/></button></div>' )
    rStudioBtn.click( function ( e ) {
        EventBus.dispatch( Events.APP_MANAGER.OPEN_IFRAME, null, '/sandbox/rstudio/' )
    } )
    $apps.append( rStudioBtn )
    
    $.each( apps, function ( i, app ) {
        var div = $( '<div/>' )
        var btn = $( '<button class="btn btn-base app"></button>' )
        btn.html( app.label )
        // btn.attr( 'href', app.path )
        btn.click( function ( e ) {
            EventBus.dispatch( Events.APP_MANAGER.OPEN_IFRAME, null, app.path )
        } )
        
        div.append( btn )
        $apps.append( div )
    } )
}

module.exports = {
    init     : init
    , setApps: setApps
}