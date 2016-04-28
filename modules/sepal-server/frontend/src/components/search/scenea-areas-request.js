/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )

var SceneAreasRequest = function () {

    this.countryCode = ''

    this.fromYear  = -1
    this.fromMonth = -1
    this.fromDay   = -1

    this.toYear  = -1
    this.toMonth = -1
    this.toDay   = -1

    this.targetDayMonth = -1
    this.targetDayDay   = -1

    var $this = this
    EventBus.addEventListener( Events.MAP.SCENE_AREA_CLICK, function ( e, sceneAreaId ) {
        $this.getSceneArea( sceneAreaId )
    } )
}

SceneAreasRequest.prototype.fromChange = function ( datePicker ) {
    this.fromYear  = datePicker.getYear()
    this.fromMonth = datePicker.getMonth()
    this.fromDay   = datePicker.getDay()
}

SceneAreasRequest.prototype.toChange = function ( datePicker ) {
    this.toYear  = datePicker.getYear()
    this.toMonth = datePicker.getMonth()
    this.toDay   = datePicker.getDay()
}

SceneAreasRequest.prototype.targetDayChange = function ( datePicker ) {
    this.targetDayMonth = datePicker.getMonth()
    this.targetDayDay   = datePicker.getDay()
}

SceneAreasRequest.prototype.requestSceneAreas = function () {
    var data   = { countryIso: this.countryCode }
    var params = {
        url: '/api/data/sceneareas'
        , data: data
        , beforeSend: function () {
            Loader.show()
            EventBus.dispatch( Events.SECTION.REDUCE, null )
        }
        , success: function ( response ) {
            EventBus.dispatch( Events.MAP.LOAD_SCENE_AREAS, null, response )
            Loader.hide( { delay: 300 } )
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

SceneAreasRequest.prototype.getSceneArea = function ( sceneAreaId ) {
    // console.log( sceneAreaId )

    var params = {
        url: '/api/data/sceneareas/' + sceneAreaId
        , beforeSend: function () {
            Loader.show()
        }
        , success: function ( response ) {

            EventBus.dispatch( Events.SECTION.SEARCH.SHOW_SCENE_AREA, null, response )

            // loadSceneArea( response )
            console.log( response )
            Loader.hide( { delay: 500 } )
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var _instance = new SceneAreasRequest()

module.exports = _instance