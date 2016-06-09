/**
 * @author Mino Togna
 */

var EventBus       = require( '../event/event-bus' )
var Events         = require( '../event/events' )
var Loader         = require( '../loader/loader' )
var View           = require( './search-retrieve-v' )
var SceneAreaModel = require( '../search/scene-images-selection-m' )
var SearchForm     = require( '../search/search-form' )

View.init()
View.hide({delay:0,duration:0})

var appShow   = function ( e, section ) {
    View.hide()
}
var appReduce = function ( e, section ) {
    if ( SceneAreaModel.areasSelection().length > 0 ) {
        View.show()
    }
}

var getRequestData = function () {
    var data        = {}
    data.countryIso = SearchForm.countryCode()
    
    var scenes = new Array()
    $.each( SceneAreaModel.areasSelection(), function ( i, k ) {
        $.each( SceneAreaModel.getSceneAreaSelectedImages( k ), function ( j, img ) {
            scenes.push( { sceneId: img.sceneId, sensor: img.sensor } )
        } )
    } )
    data.scenes = scenes
    
    return data
}

var getRequestParams = function ( url ) {
    var data   = getRequestData()
    var params = {
        url         : url
        , data      : data
        , type    : "POST"
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function () {
            Loader.hide( { delay: 300 } )
        }
    }
    return params
}

var retrieve = function () {
    // '/data/scenes/retrieve') 
//  { countryIso:ITA, scenes:[ {sceneId: 'LC81900302015079LGN00', sensor: 'LC8'}, ... ] }
    var params = getRequestParams( '/api/data/scenes/retrieve' )
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var mosaic = function () {
    var params = getRequestParams( '/api/data/scenes/mosaic' )
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

EventBus.addEventListener( Events.SECTION.SHOW, appShow )
EventBus.addEventListener( Events.SECTION.REDUCE, appReduce )

EventBus.addEventListener( Events.SECTION.SEARCH.RETRIEVE, retrieve )
EventBus.addEventListener( Events.SECTION.SEARCH.MOSAIC, mosaic )
