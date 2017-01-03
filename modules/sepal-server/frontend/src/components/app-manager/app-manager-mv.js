/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './app-manager-v' )

var init = function () {
    View.init()
}

var openView = function () {
    View.show()
}

var openIFrameApp = function ( e, path ) {
    openView()
    stopServerRequest()
    
    startServer( function () {
        View.showIFrameApp( path )
    }, path )
}

var openDataVisApp = function ( e ) {
    openView()
    stopServerRequest()
    
    startServer( function () {
        View.showDataVisApp()
    }, '/data-vis' )
}

var checkServerIntervalId = null
var stopServerRequest     = function () {
    // console.log( 'clearing job ', checkServerIntervalId )
    clearInterval( checkServerIntervalId )
    checkServerIntervalId = null
}

var startServer = function ( callback, path ) {
    
    var checkServerRequest = function () {
        var params = {
            url      : "/sandbox/start"
            , data   : { path: path }
            , success: function ( response ) {
                var status = response.status
                // console.log( 'checking ', status, ' job ', checkServerIntervalId )
                if ( status === 'STARTED' ) {
                    stopServerRequest()
                    callback()
                } else {
                    View.showLoading()
                }
                
            }
        }
        EventBus.dispatch( Events.AJAX.POST, null, params )
    }
    
    checkServerIntervalId = setInterval( checkServerRequest, 500 )
    
}

init()

EventBus.addEventListener( Events.APP_MANAGER.OPEN_IFRAME, openIFrameApp )
EventBus.addEventListener( Events.APP_MANAGER.OPEN_DATAVIS, openDataVisApp )