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
    
    startServer( function () {
        View.showIFrameApp( path )
    }, 'rstudio' )
}

var openIFrameApp = function ( e, path ) {
    openView()
    
    startServer( function () {
        View.showIFrameApp( path )
    }, 'shiny' )
}

var openDataVisApp = function ( e ) {
    openView()
    
    startServer( function () {
        View.showDataVisApp()
    }, 'geo-web-viz' )
}

var openJupyterApp = function ( e, path ) {
    openView()

    startServer( function () {
        View.showIFrameApp(path)
    }, 'jupyter' )
}

var startServer = function ( callback, endpoint ) {
    var params = {
        url      : "/sandbox/start?endpoint=" + endpoint
        // , data   : { endpoint: endpoint }
        , success: function ( response ) {
            var status = response.status
            if ( status === 'STARTED' ) {
                callback()
            } else {
                View.showLoading()
                setTimeout( function () {
                    EventBus.dispatch( Events.AJAX.GET, null, params )   // Check sandbox status, using HTTP GET
                }, 1000 )
            }
        }
    }
    EventBus.dispatch( Events.AJAX.POST, null, params )  // Start sandbox, using HTTP POST
}

init()

EventBus.addEventListener( Events.APP_MANAGER.OPEN_IFRAME, openIFrameApp )
EventBus.addEventListener( Events.APP_MANAGER.OPEN_RSTUDIO, openRStudioApp )
EventBus.addEventListener( Events.APP_MANAGER.OPEN_DATAVIS, openDataVisApp )
EventBus.addEventListener( Events.APP_MANAGER.OPEN_JUPYTER, openJupyterApp )