/**
 * @author Mino Togna
 */
require( './app-manager.scss' )

var IFrameApp = require( './apps/iframe/iframe-app-mv' )

var html         = null
var appContainer = null
var btnClose     = null
var init         = function () {
    var template = require( './app-manager.html' )
    html         = $( template( {} ) )
    
    $( 'body' ).append( html )
    
    appContainer = html.find( '.app-container' )
    btnClose     = html.find( '.btn-close' )
    btnClose.click( function ( e ) {
        e.preventDefault()
        html.modal( 'hide' )
    } )
}

var show = function () {
    html.modal( { show: true, backdrop: 'static' } )
}

var showLoading = function () {
    appContainer.find( '.sepal-app:not(.loader-app)' ).hide()
    appContainer.find( '.loader-app' ).show()
}

var hideLoading = function () {
    appContainer.find( '.loader-app' ).hide()
}

var showDataVisApp = function () {
    hideLoading()
}


var showIFrameApp = function ( path ) {
    hideLoading()
    IFrameApp.show( appContainer, path )
}

module.exports = {
    init            : init
    , show          : show
    , showLoading   : showLoading
    , showIFrameApp : showIFrameApp
    , showDataVisApp: showDataVisApp
    
}