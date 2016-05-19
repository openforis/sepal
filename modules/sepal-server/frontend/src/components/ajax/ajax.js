/**
 *
 * Module for handling ajax calls
 *
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' );
var Events   = require( '../event/events' );

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
        switch ( xhr.status ) {
            case 401 :
                console.log( "no access" )
                EventBus.dispatch( Events.LOGIN.SHOW )
                break;

            default :
                console.log( 'Error on javascript call' )
                console.log( arguments )
        }
    }

} )

var ajaxRequest = function ( e, params ) {
    $.ajax( params )
}

EventBus.addEventListener( Events.AJAX.REQUEST, ajaxRequest )