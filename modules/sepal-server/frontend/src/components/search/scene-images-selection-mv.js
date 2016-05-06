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
        
        // var appSection = $( '#app-section' ).find( '.scene-images-selection' )
        // if ( appSection.children().length <= 0 ) {
        View.init()
        // }
        
    }
}

var update = function ( e, sceneImages ) {
    Model.setAvailableImages( sceneImages )
    View.reset()
    
    $.each( Model.getAvailableImages(), function ( id, sceneImage ) {
        View.addToSelection( sceneImage )
    } )
    
}

var selectImage = function ( e, sceneImage ) {
    View.hideFromSelection( sceneImage )
    Model.select( sceneImage )
    View.addToSelectedSection( sceneImage )
}

var loadSceneImages = function ( e, sceneAreaId ) {
    Model.sceneAreaId = sceneAreaId
    console.log( Model )

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
            EventBus.dispatch( Events.SECTION.SCENE_IMAGES_SELECTION.UPDATE, null, response )
            
            Loader.hide( { delay: 500 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

EventBus.addEventListener( Events.MAP.SCENE_AREA_CLICK, loadSceneImages )

EventBus.addEventListener( Events.SECTION.SHOW, show )
EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.UPDATE, update )
EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.SELECT, selectImage )

