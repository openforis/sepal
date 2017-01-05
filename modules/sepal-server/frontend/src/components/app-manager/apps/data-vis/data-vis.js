/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './data-vis-v' )


var appLoad = function () {
    View.init()
}

// var mapAnalysisZoomTo = function ( e, address ) {
//     View.zoomTo( address )
// }
//
// var mapAnalysisZoomChanged = function ( e, zoom ) {
//     View.setZoom( zoom )
// }

EventBus.addEventListener( Events.APP.LOAD, appLoad )
// map analysis zoom changes
// EventBus.addEventListener( Events.MAP.ZOOM_TO, mapAnalysisZoomTo )
// EventBus.addEventListener( Events.MAP.ZOOM_CHANGED, mapAnalysisZoomChanged )