/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )

var SearchRequestUtils = require( './../search/search-request-utils' )

var SceneSelectionModel = require( '../scenes-selection/scenes-selection-m' )

var retrieveScenes = function ( e, state ) {
    var data = { dataSet: state.sensorGroup }
    SearchRequestUtils.addSceneIds( state, data )
    
    var params = {
        url      : '/api/data/scenes/retrieve'
        , data   : data
        , success: function () {
            EventBus.dispatch( Events.SECTION.TASK_MANAGER.CHECK_STATUS )
        }
    }
    EventBus.dispatch( Events.AJAX.POST, null, params )
}

var requestBestScenes = function ( e, state ) {
    
    var data = {
        targetDayOfYearWeight: state.sortWeight
        , cloudCoverTarget   : 0.0001
        , minScenes          : state.minScenes
        , maxScenes          : state.maxScenes
        , dataSet            : state.sensorGroup
    }
    SearchRequestUtils.addSceneAreaIds( state, data )
    SearchRequestUtils.addSensorIds( state, data )
    SearchRequestUtils.addDatesRequestParameters( state, data )
    
    var params = {
        url         : '/api/data/best-scenes'
        , data      : data
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            SceneSelectionModel.setState( state )
            
            $.each( Object.keys( response ), function ( i, sceneAreaId ) {
                SceneSelectionModel.setSceneAreaId( sceneAreaId )
                SceneSelectionModel.resetSelection()
                
                var scenes = response[ sceneAreaId ]
                $.each( scenes, function ( j, scene ) {
                    SceneSelectionModel.select( scene )
                } )
            } )
            
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
            EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state ,{resetSceneAreas: true})
            Loader.hide( { delay: 500 } )
        }
    }
    EventBus.dispatch( Events.AJAX.POST, null, params )
    EventBus.dispatch( Events.SECTION.SCENES_SELECTION.RESET )
}

//scenes section search retrieve events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES, retrieveScenes )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.BEST_SCENES, requestBestScenes )