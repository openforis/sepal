/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Sepal    = require( '../main/sepal' )

require( './gateone' )
require( './gateone.css' )

// html
var template = require( './terminal.html' )
var html     = $( template( {} ) )
// ui components
// var section  = null

var init = function () {
    var appSection = $( '#app-section' ).find( '.terminal' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )

        var params = {
            url      : '/api/gateone/auth-object'
            , success: initTerminal
        }
        EventBus.dispatch( Events.AJAX.REQUEST, null, params )

    }
}

var initTerminal = function ( response ) {
    var terminalUri = "ssh-gateway"
    var authObject  = response.authObject
    GateOne.Utils.deleteCookie( 'gateone_user', '/', '' ); // Deletes the 'gateone_user' cookie
    GateOne.Events.on( "go:js_loaded", function () {
        if ( GateOne.Terminal.closeTermCallbacks.length == 0 )
            GateOne.Terminal.closeTermCallbacks.push( function () {
                GateOne.Terminal.newTerminal()
            } )
        GateOne.Terminal.newTerminal()
    } )
    GateOne.init( {
        url     : 'https://' + window.location.host + '/gateone',
        // url           : 'https://172.28.128.3/gateone',
        autoConnectURL: 'ssh://' + Sepal.User.username + '@' + terminalUri + '?identities=id_rsa',
        auth          : authObject,
        embedded      : true,
    } )
}

module.exports = {
    init: init
}