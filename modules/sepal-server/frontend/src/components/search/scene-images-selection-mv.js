/**
 * @author Mino Togna
 */

var EventBus   = require( '../event/event-bus' )
var Events     = require( '../event/events' )
var Loader     = require( '../loader/loader' )
//
var Model      = require( './scene-images-selection-m' )
var View       = require( './scene-images-selection-v' )
var SearchForm = require( './search-form' )

var show = function ( e, type ) {
    if ( type == 'scene-images-selection' ) {
        View.init()
    }
}

var reset = function ( e ) {
    Model.reset()
}

var update = function ( e, sceneAreaId, sceneImages ) {
    Model.setSceneArea( sceneAreaId, sceneImages )
    View.reset()
    
    $.each( Model.getSceneAreaImages(), function ( id, sceneImage ) {
        View.add( sceneImage )
    } )
    
    $.each( Model.getSceneAreaSelectedImages( Model.getSceneAreaId() ), function ( id, sceneImage ) {
        View.select( sceneImage )
    } )

}

var selectImage = function ( e, sceneImage ) {
    Model.select( sceneImage )
    View.select( sceneImage )

    EventBus.dispatch( Events.MODEL.SCENE_AREA.CHANGE, null, Model.getSceneAreaId() )
}

var deselectImage = function ( e, sceneImage ) {
    Model.deselect( sceneImage )
    View.deselect( sceneImage )

    EventBus.dispatch( Events.MODEL.SCENE_AREA.CHANGE, null, Model.getSceneAreaId() )
}

var loadSceneImages = function ( e, sceneAreaId ) {
    // get('/data/sceneareas/{sceneAreaId}')
    
    // params.targetDay //MM-dd
    // params.startDate //YYYY-MM-dd
    // params.endDate  //YYYY-MM-dd
    var SEP  = '-'
    var data = {
        startDate  : SearchForm.startDate().value()
        , endDate  : SearchForm.endDate().value()
        , targetDay: SearchForm.targetDay().value()
    }
    
    var params = {
        url         : '/api/data/sceneareas/' + Model.sceneAreaId
        , data      : data
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            
            EventBus.dispatch( Events.SECTION.SHOW, null, 'scene-images-selection' )
            EventBus.dispatch( Events.SECTION.SCENE_IMAGES_SELECTION.UPDATE, null, sceneAreaId, response )
            
            Loader.hide( { delay: 500 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

EventBus.addEventListener( Events.MAP.SCENE_AREA_CLICK, loadSceneImages )

EventBus.addEventListener( Events.SECTION.SHOW, show )
EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.RESET, reset )
EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.UPDATE, update )
EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.SELECT, selectImage )
EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.DESELECT, deselectImage )

