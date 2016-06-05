/**
 * @author Mino Togna
 */
require( './search.css' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )

var View = require( './search-v' )

require( './scene-images-selection-mv' )
require( '../search-retrieve/search-retrieve-mv' )

var show = function ( e, type ) {
    if ( type == 'search' ) {
        View.init()
    }
}

var requestSceneAreas = function () {
    
    var data = { countryIso: View.Form.countryCode() }
    
    var params = {
        url         : '/api/data/sceneareas'
        , data      : data
        , beforeSend: function () {
            Loader.show()
            EventBus.dispatch( Events.SECTION.REDUCE, null )
        }
        , success   : function ( response ) {
            EventBus.dispatch( Events.SECTION.SCENE_IMAGES_SELECTION.RESET )
            EventBus.dispatch( Events.MAP.LOAD_SCENE_AREAS, null, response )
            Loader.hide( { delay: 300 } )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

EventBus.addEventListener( Events.SECTION.SHOW, show )
EventBus.addEventListener( Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, requestSceneAreas )