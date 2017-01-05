/**
 * @author Mino Togna
 */
require( './app-manager.scss' )

var IFrameApp  = require( './apps/iframe/iframe-app-mv' )
var DataVisApp = require( './apps/data-vis/data-vis-mv' )

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
    
    html.on( 'hidden.bs.modal', function ( e ) {
        showLoading()
    } )
}

var show = function () {
    html.modal( { show: true, backdrop: 'static' } )
}

var showLoading = function () {
    appContainer.find( '.sepal-app:not(.loader-app)' ).remove()
    appContainer.find( '.loader-app' ).show()
}

var hideLoading = function () {
    appContainer.find( '.loader-app' ).hide()
}

var showDataVisApp = function () {
    hideLoading()
    DataVisApp.show( appContainer )
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