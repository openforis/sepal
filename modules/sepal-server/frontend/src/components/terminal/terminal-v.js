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
    var terminalUri             = "ssh-gateway"
    var authObject              = response.authObject
    var registeredCloseCallback = false
    
    function initGateOne() {
        var terminalCount = GateOne.Terminal.terminals.count()
        for ( var i = 0; i < terminalCount; i++ )
            GateOne.Terminal.closeTerminal( i )
        GateOne.Terminal.newTerminal()
    }
    
    GateOne.Events.on( "go:js_loaded", function () {
        if ( !registeredCloseCallback ) {
            GateOne.Terminal.closeTermCallbacks.push( function () {
                initGateOne()
            } )
            registeredCloseCallback = true
        }

        initGateOne()
    } )

    GateOne.Utils.deleteCookie( 'gateone_user', '/', '' ) // Deletes the 'gateone_user' cookie
    GateOne.init( {
        audibleBell           : false,
        auth                  : authObject,
        autoConnectURL        : 'ssh://' + Sepal.User.username + '@' + terminalUri + '?identities=id_rsa',
        disableTermTransitions: true,
        embedded              : true,
        url                   : 'https://172.28.128.3/gateone',
        // url                   : 'https://' + window.location.host + '/gateone',
        showTitle             : false,
        showToolbar           : false,
        style                 : {}
    } )
}
module.exports   = {
    init: init
}