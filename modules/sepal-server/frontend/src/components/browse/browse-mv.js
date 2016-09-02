/**
 * @author Mino Togna
 */

var EventBus     = require( '../event/event-bus' )
var Events       = require( '../event/events' )
var Loader       = require( '../loader/loader' )
var View         = require( './browse-v' )
var Model        = require( './browse-m' )
var FileDownload = require( '../file-download/file-download' )

var initialized = false

var show = function ( e, type ) {
    
    if ( type == 'browse' ) {
        View.init()
        // if ( !initialized ) {
        loadDir( -1, '/' )
        // initialized = true
        // }
    }
    
}

var loadDir = function ( parentLevel, name ) {
    var path   = Model.absolutePath( parentLevel, name )
    var level  = parentLevel + 1
    var params = {
        url      : '/api/user/files'
        , data   : { path: path }
        , success: function ( response ) {
            // console.log( response )
            Model.setLevel( level, name, response )
            View.addDir( Model.getLevel( level ) )
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var navItemClick = function ( evt, parentLevel, file ) {
    //child.name
    if ( file.isDirectory === true ) {
        loadDir( parentLevel, file.name )
    } else {
        View.removeDir( parentLevel + 1 )
    }
    
}

var downloadItem = function ( evt, absPath ) {
    FileDownload.download( '/api/user/files/download', { path: absPath } )
}

EventBus.addEventListener( Events.SECTION.SHOW, show )
EventBus.addEventListener( Events.SECTION.BROWSE.NAV_ITEM_CLICK, navItemClick )
EventBus.addEventListener( Events.SECTION.BROWSE.DOWNLOAD_ITEM, downloadItem )