/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
// var SceneAreasOverlayView = require( './scene-areas/scene-areas-v' )
var View     = require( './scene-areas/scene-areas-v' )
var Model    = require( './scene-areas/scene-areas-m' )


var sceneAreasLoaded = function ( e, scenes ) {
    // if ( View ) {
    //     View.setMap( null )
    // }
    
    Model.scenes = scenes
    View.add( Model.scenesToMapPolygons() )
    // View         = SceneAreasOverlayView.newInstance( Model.scenesToMapPolygons() )
    
    // EventBus.dispatch( Events.MAP.ADD_LAYER, null, View )
}

var onApplicationSectionShow = function ( e ) {
    // if ( View )
        View.hide()
}

var onApplicationSectionReduce = function ( e ) {
    // if ( View )
        View.show()
}

var onToggleVisibility = function ( e ) {
    // if ( View )
        View.toggleVisibility()
}

var onSceneAreaChange = function ( e, sceneAreaId ) {
    var cnt = Model.countSeletedImages( sceneAreaId )
    View.setCount( sceneAreaId, cnt )
}

var onResetSceneAreas = function ( e ) {
    // if ( View )
        View.reset()
}

var onMapZoomChanged = function ( e, zoomLevel ) {
    // if ( View )
        View.setZoomLevel( zoomLevel )
}

EventBus.addEventListener( Events.SECTION.SEARCH.SCENE_AREAS_LOADED, sceneAreasLoaded )

EventBus.addEventListener( Events.SECTION.SHOW, onApplicationSectionShow )
EventBus.addEventListener( Events.SECTION.REDUCE, onApplicationSectionReduce )

EventBus.addEventListener( Events.MAP.SCENE_AREA_TOGGLE_VISIBILITY, onToggleVisibility )

EventBus.addEventListener( Events.MODEL.SCENE_AREA.CHANGE, onSceneAreaChange )

EventBus.addEventListener( Events.MAP.SCENE_AREA_RESET, onResetSceneAreas )

EventBus.addEventListener( Events.MAP.ZOOM_CHANGED, onMapZoomChanged )