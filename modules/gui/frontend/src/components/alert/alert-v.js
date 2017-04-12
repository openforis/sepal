/**
 * @author Mino Togna
 */
require( './alert.scss' )

var html     = null
var $message = null
var init     = function () {
    var template = require( './alert.html' )
    html         = $( template( {} ) )
    
    html.alert( 'close' )
    $message = html.find( '.message' )
}

var showInfo = function ( msg ) {
    showMessage( msg, 'alert-info' )
}

var showMessage = function ( msg, type ) {
    $message.html( msg )
    
    $( 'body' ).append( html )
    html.removeClass( 'alert-success alert-info alert-warning alert-danger fade in' ).addClass( type ).alert().addClass( 'fade in' )
    
    setTimeout( function () {
        // html.fadeOut()
        html.alert( 'close' )
    }, 3500 )
}

module.exports = {
    init      : init
    , showInfo: showInfo
}