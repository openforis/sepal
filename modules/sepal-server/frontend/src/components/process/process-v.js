/**
 * @author Mino Togna
 */
require( './process.scss' )

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
    
    var rStudioBtn = $( '<div><a class="btn btn-base app r-studio" target="_blank" href="/sandbox/rstudio"><img src="' + rStudioImg + '"/></a></div>' )
    $apps.append( rStudioBtn )
    
    $.each( apps, function ( i, app ) {
        var div = $( '<div/>' )
        var a   = $( '<a class="btn btn-base app" target="_blank"></a>' )
        
        a.html( app.label )
        a.attr( 'href', app.path )
        
        div.append( a )
        $apps.append( div )
    } )
}

module.exports = {
    init     : init
    , setApps: setApps
}