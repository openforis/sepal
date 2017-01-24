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

var openRStudioApp = function ( e, path ) {
    openView()
    stopServerRequest()
    
    startServer( function () {
        View.showIFrameApp( path )
    }, 'rstudio' )
}

var openIFrameApp = function ( e, path ) {
    openView()
    stopServerRequest()
    
    startServer( function () {
        View.showIFrameApp( path )
    }, 'shiny' )
}

var openDataVisApp = function ( e ) {
    openView()
    stopServerRequest()
    
    startServer( function () {
        View.showDataVisApp()
    }, 'geo-web-viz' )
}

var checkServerIntervalId = null
var stopServerRequest     = function () {
    clearInterval( checkServerIntervalId )
    checkServerIntervalId = null
}

var startServer = function ( callback, endpoint ) {
    
    var checkServerRequest = function () {
        var params = {
            url      : "/sandbox/start?endpoint="+endpoint
            // , data   : { endpoint: endpoint }
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
EventBus.addEventListener( Events.APP_MANAGER.OPEN_RSTUDIO, openRStudioApp )
EventBus.addEventListener( Events.APP_MANAGER.OPEN_DATAVIS, openDataVisApp )