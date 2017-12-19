/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )
var guid     = require( '../guid/guid' )
var moment   = require( 'moment' )

var SearchRequestUtils = require( './../search/search-request-utils' )

var previewMosaic = function ( e, state ) {
  var data   = SearchRequestUtils.getImageData( state, state.mosaicPreviewBand )
  data.panSharpening = state.panSharpening
  var params = {
    url          : '/gee/preview'
    , data       : JSON.stringify( data )
    , contentType: "application/json; charset=utf-8"
    , dataType   : "json"
    , beforeSend : function () {
      Loader.show()
    }
    , success    : function ( response ) {
      state.mosaic = { mapId: response.mapId, token: response.token }
      EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.MOSAIC_LOADED, null, state.mosaic.mapId, state.mosaic.token )
      EventBus.dispatch( Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state )
      EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
      
      Loader.hide( { delay: 500 } )
    }
  }
  
  EventBus.dispatch( Events.AJAX.POST, null, params )
}

var retrieveMosaic = function ( e, state, obj ) {
  var data = {
    operation: obj.destination === 'sepal' ? 'sepal.image.sepal_export' : 'sepal.image.asset_export',
    params   : {
      title      : obj.destination === 'sepal'
        ? "Retrieve mosaic '" + obj.name + "' to Sepal"
        : "Export mosaic '" + obj.name + "' to Earth Engine",
      description: obj.name,
      image      : SearchRequestUtils.getImageData( state, obj.bands )
    }
  }
  
  var params = {
    url          : '/api/tasks'
    , data       : JSON.stringify( data )
    , contentType: "application/json; charset=utf-8"
    , dataType   : "json"
    , beforeSend : function () {
      setTimeout( function () {
        EventBus.dispatch( Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager' )
      }, 100 )
      EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
    }
    , success    : function ( e ) {
      EventBus.dispatch( Events.SECTION.TASK_MANAGER.CHECK_STATUS )
    }
  }
  EventBus.dispatch( Events.AJAX.POST, null, params )
}

//mosaic section search retrieve events
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_MOSAIC, previewMosaic )
EventBus.addEventListener( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_MOSAIC, retrieveMosaic )
