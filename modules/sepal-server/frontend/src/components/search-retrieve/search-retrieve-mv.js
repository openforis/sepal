/**
 * @author Mino Togna
 */

var EventBus         = require( '../event/event-bus' )
var Events           = require( '../event/events' )
var Loader           = require( '../loader/loader' )
var View             = require( './search-retrieve-v' )
var Model            = require( './search-retrieve-m' )
var SceneAreaModel   = require( '../scenes-selection/scenes-selection-m' )
var ScenesFilterView = require( '../search-retrieve/scenes-autoselection-form-v' )
var SearchForm       = require( '../search/views/search-form' )
var Filter           = require( './../scenes-selection-filter/scenes-selection-filter-m' )

var show     = false
var appShown = true

var init = function (  ) {
    show     = false
    appShown = true
    
    View.init()
    View.hide( { delay: 0, duration: 0 } )
}


var appShow   = function ( e, section ) {
    View.hide()
    appShown = true
}
var appReduce = function ( e, section ) {
    appShown = false
    if ( show ) {
        View.show()
    }
}

var getRequestData = function () {
    var data        = {}
    data.countryIso = SearchForm.countryCode()
    
    var scenes = []
    // console.log( "request data: ", SceneAreaModel )
    $.each( SceneAreaModel.areasSelection(), function ( i, k ) {
        $.each( SceneAreaModel.getSceneAreaSelectedImages( k ), function ( j, img ) {
            scenes.push( { sceneId: img.sceneId, sensor: img.sensor } )
        } )
    } )
    data.scenes = JSON.stringify( scenes )
    
    return data
}

var getRequestParams = function ( url ) {
    var data   = getRequestData()
    var params = {
        url         : url
        , data      : data
        , type      : "POST"
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function () {
            Loader.hide( { delay: 300 } )
            EventBus.dispatch( Events.SECTION.TASK_MANAGER.CHECK_STATUS )
        }
    }
    return params
}

var retrieveScenes = function () {
    var params = getRequestParams( '/api/data/scenes/retrieve' )
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var retrieveMosaic = function () {
    var params = getRequestParams( '/api/data/scenes/mosaic' )
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var sceneAreasLoaded = function ( e, sceneAreas ) {
    show = true
    // if ( appShown == false ) {
        // appReduce()
    // }
    View.reset()
    
    EventBus.dispatch( Events.MAP.REMOVE_EE_LAYER )
    
    Model.setSceneAreas( sceneAreas )
}

var bestScenes = function ( e ) {
    var DATE_FORMAT = "YYYY-MM-DD"
    var targetDate  = SearchForm.targetDate().asMoment()
    
    var data = {
        fromDate               : targetDate.clone().subtract( Filter.getOffsetToTargetDay() / 2, 'years' ).format( DATE_FORMAT )
        , toDate               : targetDate.clone().add( Filter.getOffsetToTargetDay() / 2, 'years' ).format( DATE_FORMAT )
        , targetDayOfYear      : targetDate.format( "DDD" )
        , targetDayOfYearWeight: Filter.getSortWeight()
        , cloudCoverTarget     : 0.0001
        , sensorIds            : Filter.getSelectedSensors().join( ',' )
        , sceneAreaIds         : Model.getSceneAreaIds().join( ',' )
    }
    
    var params = {
        url         : '/api/data/best-scenes'
        , data      : data
        , type      : 'POST'
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            EventBus.dispatch( Events.SECTION.SCENES_SELECTION.RESET )
            EventBus.dispatch( Events.MAP.SCENE_AREA_RESET )
            EventBus.dispatch( Events.MAP.REMOVE_EE_LAYER )
            
            $.each( Object.keys( response ), function ( i, sceneAreaId ) {
                var scenes = response[ sceneAreaId ]
                $.each( scenes, function ( j, scene ) {
                    EventBus.dispatch( Events.SECTION.SCENES_SELECTION.SELECT, null, sceneAreaId, scene )
                } )
            } )
            View.collapse()
            Loader.hide( { delay: 500 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var previewMosaic = function ( e, bands ) {
    
    var targetDate = SearchForm.targetDate().asMoment()
    var data       = {
        countryIso             : SearchForm.countryCode()
        , targetDayOfYear      : targetDate.format( "DDD" )
        , targetDayOfYearWeight: 0.5
        // , targetDayOfYearWeight: Filter.getSortWeight()
        , bands                : bands
        , sceneIds             : SceneAreaModel.getSelectedSceneIds().join( ',' )
    }
    
    var params = {
        url         : '/api/data/mosaic/preview-scenes'
        , data      : data
        , type      : 'POST'
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            EventBus.dispatch( Events.MAP.ADD_EE_LAYER, null, response.mapId, response.token )
            View.collapse()
            Loader.hide( { delay: 500 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var onAddEELayer = function ( e ) {
    View.enableToggleLayerButtons()
}

var onRemoveEELayer = function ( e ) {
    View.disableToggleLayerButtons()
}

var onSceneAreaChange = function ( e ) {
    if ( SceneAreaModel.getSelectedSceneIds().length > 0 ) {
        View.enableScenesSelectionRequiredButtons()
    } else {
        View.disableScenesSelectionRequiredButtons()
    }
}
// app events
EventBus.addEventListener( Events.APP.LOAD, init )

// app section events
EventBus.addEventListener( Events.SECTION.SHOW, appShow )
EventBus.addEventListener( Events.SECTION.REDUCE, appReduce )

//search retrieve events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES, retrieveScenes )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_MOSAIC, retrieveMosaic )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.BEST_SCENES, bestScenes )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_MOSAIC, previewMosaic )

//search events
EventBus.addEventListener( Events.SECTION.SEARCH.SCENE_AREAS_LOADED, sceneAreasLoaded )
EventBus.addEventListener( Events.MODEL.SCENE_AREA.CHANGE, onSceneAreaChange )

EventBus.addEventListener( Events.MAP.ADD_EE_LAYER, onAddEELayer )
EventBus.addEventListener( Events.MAP.REMOVE_EE_LAYER, onRemoveEELayer )