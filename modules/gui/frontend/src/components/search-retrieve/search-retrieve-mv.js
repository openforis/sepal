/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './search-retrieve-v' )
var Model    = require( '../search/model/search-model' )

require( './search-retrieve-scenes-mv' )
require( './search-retrieve-mosaic-mv' )

var show     = false
var appShown = true

var init = function () {
    show     = false
    appShown = true
    
    View.init()
    View.hide( { delay: 0, duration: 0 } )
}

var appShow = function ( e, section ) {
    View.hide()
    appShown = true
}

var appReduce = function ( e, section ) {
    appShown = false
    if ( show ) {
        View.show()
    }
}

var activeStateChanged = function ( e, s ) {
    if ( s.type === Model.TYPES.MOSAIC ) {
        if ( s.sceneAreas )
            show = true
    } else {
        show = true
    }
}

// app events
EventBus.addEventListener( Events.APP.LOAD, init )

// app section events
EventBus.addEventListener( Events.SECTION.SHOW, appShow )
EventBus.addEventListener( Events.SECTION.REDUCE, appReduce )

// view events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW, View.collapse )

EventBus.addEventListener( Events.SECTION.SEARCH.MODEL.ACTIVE_CHANGED, activeStateChanged )

//search events
// on request scene areas, reset create mosaic view
EventBus.addEventListener( Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, View.resetCreateMosaic )

