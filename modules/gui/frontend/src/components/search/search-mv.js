/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )

require( './search-params-mv' )

var View         = require( './search-v' )
var SearchParams = require( '../search/search-params' )

require( '../scene-areas/scene-areas-mv' )
require( '../scenes-selection/scenes-selection-mv' )
require( '../search-retrieve/search-retrieve-mv' )
require( '../scene-area-mosaics/scene-area-mosaics-mv' )

var show = function ( e, type ) {
    if ( type == 'search' ) {
        View.init()
    }
}

var requestSceneAreas = function () {
    
    var landsatLoaded   = false
    var sentinel2Loaded = false
    
    var landsatRequest = function ( params, data ) {
        data.dataSet   = SearchParams.SENSORS.LANDSAT
        params.data    = data
        params.success = function ( response ) {
            EventBus.dispatch( Events.SECTION.SEARCH.LANDSAT_SCENE_AREAS_LOADED, null, response )
            landsatLoaded = true
            checkResponses()
        }
        EventBus.dispatch( Events.AJAX.POST, null, params )
    }
    
    var sentinel2Request = function ( params, data ) {
        data.dataSet   = SearchParams.SENSORS.SENTINEL2
        params.data    = data
        params.success = function ( response ) {
            EventBus.dispatch( Events.SECTION.SEARCH.SENTINEL2_SCENE_AREAS_LOADED, null, response )
            sentinel2Loaded = true
            checkResponses()
        }
        EventBus.dispatch( Events.AJAX.POST, null, params )
    }
    
    var checkResponses = function () {
        if ( landsatLoaded && sentinel2Loaded ) {
            EventBus.dispatch( Events.SECTION.SEARCH.SCENE_AREAS_LOADED )
            EventBus.dispatch( Events.SECTION.REDUCE )
            Loader.hide( { delay: 300 } )
        }
    }
    
    var data = {}
    SearchParams.addAoiRequestParameter( data )
    
    var params = { url: '/api/data/sceneareas' }
    
    Loader.show()
    EventBus.dispatch( Events.SCENE_AREAS.INIT )
    landsatRequest( params, data )
    sentinel2Request( params, data )
}

var sensorGroupChanged = function ( e, sensorGroup ) {
    View.setSensorGroup( sensorGroup )
}

EventBus.addEventListener( Events.SECTION.SHOW, show )
EventBus.addEventListener( Events.SECTION.SEARCH.FORM_SUBMIT, requestSceneAreas )

//change model values
EventBus.addEventListener( Events.SECTION.SEARCH.SEARCH_PARAMS.SENSOR_GROUP_CHANGED, sensorGroupChanged )