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
    
    startServer( function () {
        View.showIFrameApp( path )
    } )
}

var openDataVisApp = function ( e ) {
    openView()
    
    startServer( function () {
        View.showDataVisApp()
    } )
}

var checkServerIntervalId = null
var startServer           = function ( callback ) {
    
    var stopServerRequest = function () {
        clearInterval( checkServerIntervalId )
        checkServerIntervalId = null
    }
    
    if ( checkServerIntervalId ) {
        stopServerRequest()
        startServer( callback )
    }
    
    var checkServerRequest = function () {
        var params = {
            url      : "/sandbox/start"
            , success: function ( response ) {
                var status = response.status
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