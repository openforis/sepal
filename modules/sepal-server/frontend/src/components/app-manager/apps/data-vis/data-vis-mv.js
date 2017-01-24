/**
 * @author Mino Togna
 */
var EventBus = require( '../../../event/event-bus' )
var Events   = require( '../../../event/events' )
var View     = require( './data-vis-v' )

var opened = false
var queue  = []

var show = function ( container ) {
    View.show( container, function () {
        opened = true
    } )
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

var processQueue = function () {
    $.each( queue, function ( i, path ) {
        // console.log( "Item ", i, " is ", path )
        View.addNewLayer( path )
    } )
    queue = []
}

var close = function ( e ) {
    opened = false
}

var addFile = function ( e, path ) {
    if ( !opened ) {
        if ( $.inArray( path, queue ) < 0 ) {
            // console.log( "==== adding to map ", path )
            queue.push( path )
        }
    } else {
        // not possible at the moment
    }
}

EventBus.addEventListener( Events.APPS.DATA_VIS.MAP_INITIALIZED, loadLayers )
EventBus.addEventListener( Events.APP_MANAGER.CLOSED, close )
EventBus.addEventListener( Events.APPS.DATA_VIS.ADD_FILE, addFile )
EventBus.addEventListener( Events.APPS.DATA_VIS.LAYERS_LOADED, processQueue )

module.exports = {
    show: show
}