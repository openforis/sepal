/**
 * @author Mino Togna
 */

require( './dialog.scss' )

var dialog = null
var btnYes = null
var btnNo  = null

// functions passed to show methods
var onConfirm = null
var onCancel  = null

var init = function () {
    var template = require( './dialog.html' )
    dialog       = $( template( {} ) )
    
    $( 'body' ).append( dialog )
    
    btnYes = dialog.find( '.btn-yes' )
    btnNo  = dialog.find( '.btn-no' )
    
    btnYes.click( function ( e ) {
        e.preventDefault()
        
        if ( onConfirm )
            onConfirm()
        
        dialog.modal( 'hide' )
    } )
    
    btnNo.click( function ( e ) {
        e.preventDefault()
        
        if ( onCancel )
            onCancel()
    
        dialog.modal( 'hide' )
    } )
}

var show = function ( options ) {
    onConfirm = options.onConfirm ? options.onConfirm : null
    onCancel  = options.onCancel ? options.onCancel : null
    var msg   = options.message
    
    dialog.find( '.message' ).html( msg )
    
    dialog.modal( 'show' )
}

init()

module.exports = {
    show: show
}