/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )

var SceneSelectionModel = require( '../scenes-selection/scenes-selection-m' )
var SearchParams        = require( '../search/search-params' )

var ViewSectionMosaic = require( './views/section-mosaic' )

var getRequestData = function ( bands, sceneIds, dataSet ) {
    var data = {
        targetDayOfYearWeight: 0.5
        , bands              : bands
        , sceneIds           : sceneIds.join( ',' )
        , dataSet            : dataSet
    }
    SearchParams.addAoiRequestParameter( data )
    SearchParams.addTargetDayOfYearRequestParameter( data )
    
    return data
}

var previewMosaic = function ( bands, sceneIds, dataSet ) {
    var data = getRequestData( bands, sceneIds, dataSet )
    
    var params = {
        url         : '/api/data/mosaic/preview'
        , data      : data
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            var evt = null
            if ( dataSet == SearchParams.SENSORS.LANDSAT ) {
                ViewSectionMosaic.enableLandsatButton()
                evt = Events.SCENE_AREA_MOSAICS.LANDSAT.ADD
            } else if ( dataSet == SearchParams.SENSORS.SENTINEL2 ) {
                ViewSectionMosaic.enableSentinel2Button()
                evt = Events.SCENE_AREA_MOSAICS.SENTINEL2.ADD
            }
            
            EventBus.dispatch( evt, null, response.mapId, response.token )
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
            Loader.hide( { delay: 500 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.POST, null, params )
}

var previewLandsatMosaic = function ( e, bands ) {
    var sceneIds = SceneSelectionModel.getSelectedSceneIds()[ SearchParams.SENSORS.LANDSAT ]
    var dataSet  = SearchParams.SENSORS.LANDSAT
    previewMosaic( bands, sceneIds, dataSet )
}

var previewSentinel2Mosaic = function ( e, bands ) {
    var sceneIds = SceneSelectionModel.getSelectedSceneIds()[ SearchParams.SENSORS.SENTINEL2 ]
    var dataSet  = SearchParams.SENSORS.SENTINEL2
    previewMosaic( bands, sceneIds, dataSet )
}

var retrieveMosaic = function ( bands, sceneIds, dataSet, name ) {
    var data  = getRequestData( bands, sceneIds, dataSet )
    data.name = name
    
    var params = {
        url         : '/api/data/mosaic/retrieve'
        , data      : data
        , beforeSend: function () {
            setTimeout( function () {
                EventBus.dispatch( Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager' )
            }, 100 )
            
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
        }
        , success   : function ( e ) {
            EventBus.dispatch( Events.SECTION.TASK_MANAGER.CHECK_STATUS )
        }
    }
    EventBus.dispatch( Events.AJAX.POST, null, params )
    
}

var retrieveLandsatMosaic = function ( e, bands, name ) {
    var sceneIds = SceneSelectionModel.getSelectedSceneIds()[ SearchParams.SENSORS.LANDSAT ]
    var dataSet  = SearchParams.SENSORS.LANDSAT
    retrieveMosaic( bands, sceneIds, dataSet, name )
}

var retrieveSentinel2Mosaic = function ( e, bands, name ) {
    var sceneIds = SceneSelectionModel.getSelectedSceneIds()[ SearchParams.SENSORS.SENTINEL2 ]
    var dataSet  = SearchParams.SENSORS.SENTINEL2
    retrieveMosaic( bands, sceneIds, dataSet, name )
}

var resetView = function ( e ) {
    ViewSectionMosaic.reset()
}

//mosaic section search retrieve events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_LANDSAT_MOSAIC, previewLandsatMosaic )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_SENTINEL2_MOSAIC, previewSentinel2Mosaic )

EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_LANDSAT_MOSAIC, retrieveLandsatMosaic )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SENTINEL2_MOSAIC, retrieveSentinel2Mosaic )

EventBus.addEventListener( Events.SCENE_AREAS.RESET, resetView )