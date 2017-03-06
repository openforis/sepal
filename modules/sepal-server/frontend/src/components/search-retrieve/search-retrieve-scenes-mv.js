/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )

var SceneSelectionModel = require( '../scenes-selection/scenes-selection-m' )
var SceneAreaModel      = require( '../scene-areas/scene-areas-m' )
var SearchParams        = require( '../search/search-params' )

var requestScenes = function ( url, dataSet, scenes ) {
    var params = {
        url      : url
        , data   : { dataSet: dataSet, sceneIds: JSON.stringify( scenes ) }
        , success: function () {
            EventBus.dispatch( Events.SECTION.TASK_MANAGER.CHECK_STATUS )
        }
    }
    EventBus.dispatch( Events.AJAX.POST, null, params )
}

var retrieveLandsatScenes   = function () {
    requestScenes( '/api/data/scenes/retrieve', SearchParams.SENSORS.LANDSAT, SceneSelectionModel.getSelectedSceneIds()[ SearchParams.SENSORS.LANDSAT ] )
}
var retrieveSentinel2Scenes = function () {
    requestScenes( '/api/data/scenes/retrieve', SearchParams.SENSORS.SENTINEL2, SceneSelectionModel.getSelectedSceneIds()[ SearchParams.SENSORS.SENTINEL2 ] )
}

var requestBestScenes = function ( e ) {
    
    var landsatRequestCompleted   = false
    var sentinel2RequestCompleted = false
    
    var request = function ( sensor ) {
        
        var data = {
            targetDayOfYearWeight: SearchParams.sortWeight
            , cloudCoverTarget   : 0.0001
            , minScenes          : SearchParams.minScenes
            , maxScenes          : SearchParams.maxScenes
            , dataSet            : sensor
        }
        switch ( sensor ) {
            case SearchParams.SENSORS.LANDSAT:
                data.sensorIds    = SearchParams.landsatSensors.join( ',' )
                data.sceneAreaIds = SceneAreaModel.getLandsatAreaIds().join( ',' )
                break
            case SearchParams.SENSORS.SENTINEL2:
                data.sensorIds    = SearchParams.sentinel2Sensors.join( ',' )
                data.sceneAreaIds = SceneAreaModel.getSentinel2AreaIds().join( ',' )
                break
            
        }
        SearchParams.addDatesRequestParameters( data )
        
        var params = {
            url      : '/api/data/best-scenes'
            , data   : data
            , type   : 'POST'
            , success: function ( response ) {
                
                $.each( Object.keys( response ), function ( i, sceneAreaId ) {
                    var scenes = response[ sceneAreaId ]
                    $.each( scenes, function ( j, scene ) {
                        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.SELECT, null, sceneAreaId, scene )
                    } )
                } )
                
                if ( sensor == SearchParams.SENSORS.LANDSAT )
                    landsatRequestCompleted = true
                else if ( sensor == SearchParams.SENSORS.SENTINEL2 )
                    sentinel2RequestCompleted = true
                
                checkResponses()
            }
        }
        
        EventBus.dispatch( Events.AJAX.REQUEST, null, params )
    }
    
    var checkResponses = function () {
        if ( landsatRequestCompleted && sentinel2RequestCompleted ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
            Loader.hide( { delay: 500 } )
        }
    }
    
    Loader.show()
    EventBus.dispatch( Events.SECTION.SCENES_SELECTION.RESET )
    EventBus.dispatch( Events.SCENE_AREAS.RESET )
    // EventBus.dispatch( Events.MAP.REMOVE_EE_LAYER )
    
    if ( SearchParams.landsatSensors.length > 0 ) {
        request( SearchParams.SENSORS.LANDSAT )
    } else {
        landsatRequestCompleted = true
    }
    
    if ( SearchParams.sentinel2Sensors.length > 0 ) {
        request( SearchParams.SENSORS.SENTINEL2 )
    } else {
        sentinel2RequestCompleted = true
    }
    
}

//scenes section search retrieve events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_LANDSAT_SCENES, retrieveLandsatScenes )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SENTINEL2_SCENES, retrieveSentinel2Scenes )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.BEST_SCENES, requestBestScenes )