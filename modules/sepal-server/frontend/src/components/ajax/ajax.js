/**
 *
 * Module for handling ajax calls
 *
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' );
var Events   = require( '../event/events' );
var Loader   = require( '../loader/loader' )

// ajax common parameters:

// {
//     beforeSend  : function
//     complete    : function
//     success: success,
//     type | method: The HTTP method to use for the request (e.g. "POST", "GET", "PUT"),
//     url: url,
//     data: Type: PlainObject or String or Array,
//     dataType (default: Intelligent Guess (xml, json, script, or html)),
//     contentType (default: 'application/x-www-form-urlencoded; charset=UTF-8'),
//
//     error: Type: Function( jqXHR jqXHR, String textStatus, String errorThrown )
// }

// initialize global ajax setup
$.ajaxSetup( {
    
    dataType: "json"
    
    , headers: { 'No-auth-challenge': 'true' }
    
    , type: "GET"
    
    , error: function ( xhr, ajaxOptions, thrownError ) {
        EventBus.dispatch( Events.APP.DESTROY )
        Loader.hide()
        // switch ( xhr.status ) {
        //
        //     case 401 :
        //         console.debug( "no access" )
        //         EventBus.dispatch( Events.APP.DESTROY )
        //         break;
        //
        //     default :
        //         EventBus.dispatch( Events.APP.DESTROY )
        //         console.debug( 'Error on javascript call', arguments )
        // }
    }
    
} )

var ajaxRequest = function ( e, params ) {
    $.ajax( params )
}

var getRequest = function ( e, params ) {
    params.type = "GET"
    ajaxRequest( e, params )
}

var postRequest = function ( e, params ) {
    params.type = "POST"
    ajaxRequest( e, params )
}

EventBus.addEventListener( Events.AJAX.REQUEST, ajaxRequest )
EventBus.addEventListener( Events.AJAX.GET, getRequest )
EventBus.addEventListener( Events.AJAX.POST, postRequest )
