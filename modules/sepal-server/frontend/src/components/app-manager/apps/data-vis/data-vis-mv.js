/**
 * @author Mino Togna
 */
var EventBus = require( '../../../event/event-bus' )
var Events   = require( '../../../event/events' )
var View     = require( './data-vis-v' )

var show = function ( container ) {
    View.show( container )
}

var loadLayers = function () {
    var params = {
        url      : '/sandbox/geo-web-viz/layers'
        , success: function ( response ) {
            View.loadLayers( response )
        }
    }
    EventBus.dispatch( Events.AJAX.GET, null, params )
}

EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_INITIALIZED, loadLayers )

module.exports = {
    show: show
}