/**
 * @author Mino Togna
 */
var EventBus      = require( '../event/event-bus' )
var Events        = require( '../event/events' )
var View          = require( './scene-areas-v' )
var LandsatView   = View.newInstance()
var Sentinel2View = View.newInstance()
var Model         = require( './scene-areas-m' )

var visibleArea = LandsatView

var initSceneAreas = function ( e ) {
    showLandsatArea()
}

var landsatSceneAreasLoaded   = function ( e, areas ) {
    Model.setLandsatAreas( areas )
    LandsatView.add( Model.landsatAreasToMapPolygons(), visibleArea === LandsatView )
}
var sentinel2SceneAreasLoaded = function ( e, areas ) {
    Model.setSentinel2Areas( areas )
    Sentinel2View.add( Model.sentinel2AreasToMapPolygons(), visibleArea === Sentinel2View )
}

//application visibility events
var onApplicationSectionShow = function ( e ) {
    if ( visibleArea )
        visibleArea.hide()
}

var onApplicationSectionReduce = function ( e ) {
    if ( visibleArea )
        visibleArea.show()
}
// visibility events
var showLandsatArea            = function () {
    hideSentinel2Area()
    
    LandsatView.show()
    visibleArea = LandsatView
}
var hideLandsatArea            = function () {
    visibleArea = null
    LandsatView.hide()
}
var showSentinel2Area          = function () {
    hideLandsatArea()
    
    Sentinel2View.show()
    visibleArea = Sentinel2View
}
var hideSentinel2Area          = function () {
    visibleArea = null
    Sentinel2View.hide()
}

var onSceneAreaChange = function ( e, sceneAreaId ) {
    var cnt = Model.countSeletedImages( sceneAreaId )
    LandsatView.setCount( sceneAreaId, cnt )
    Sentinel2View.setCount( sceneAreaId, cnt )
}

var resetSceneAreas = function ( e ) {
    LandsatView.reset()
    Sentinel2View.reset()
}

var onMapZoomChanged = function ( e, zoomLevel ) {
    LandsatView.setZoomLevel( zoomLevel )
    Sentinel2View.setZoomLevel( zoomLevel )
}
// events when search form is submitted
EventBus.addEventListener( Events.SCENE_AREAS.INIT, initSceneAreas )
EventBus.addEventListener( Events.SECTION.SEARCH.LANDSAT_SCENE_AREAS_LOADED, landsatSceneAreasLoaded )
EventBus.addEventListener( Events.SECTION.SEARCH.SENTINEL2_SCENE_AREAS_LOADED, sentinel2SceneAreasLoaded )

//application visibility events
EventBus.addEventListener( Events.SECTION.SHOW, onApplicationSectionShow )
EventBus.addEventListener( Events.SECTION.REDUCE, onApplicationSectionReduce )

// visibility events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.SHOW_LANDSAT_AREA, showLandsatArea )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.HIDE_LANDSAT_AREA, hideLandsatArea )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.SHOW_SENTINEL2_AREA, showSentinel2Area )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.HIDE_SENTINEL2_AREA, hideSentinel2Area )

// scenes within a scene area change
EventBus.addEventListener( Events.SCENE_AREAS.SCENES_UPDATE, onSceneAreaChange )

// reset the scene areas (remove all selected scenes within each scene area)
EventBus.addEventListener( Events.SCENE_AREAS.RESET, resetSceneAreas )

// map zoom change
EventBus.addEventListener( Events.MAP.ZOOM_CHANGED, onMapZoomChanged )