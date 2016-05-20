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
    } else
        window.setTimeout( function () {
            focusTerminal()
        }, 1000 )
}

function initTerminal( response ) {
    purgeUserPrefs()
    onTerminalInitialized( function () {
        GateOne.Storage.clearDatabase( 'terminal' )
        onTerminalClosed( function () { GateOne.Terminal.newTerminal() } )
        GateOne.Terminal.newTerminal()
        window.setTimeout( function () {
            focusTerminal()
        }, 1000 )
    } )
    GateOne.init( {
        url     : 'https://' + window.location.host + '/gateone',
        // url           : 'https://172.28.128.3/gateone',
        autoConnectURL: 'ssh://' + Sepal.User.username + '@ssh-gateway?identities=id_rsa',
        auth          : response.authObject,
        embedded      : true
    } )
}

function onTerminalClosed( callback ) {
    if ( GateOne.Terminal.closeTermCallbacks.length == 0 )
        GateOne.Terminal.closeTermCallbacks.push( callback )
}

function onTerminalInitialized( callback ) {
    GateOne.Events.on( "go:js_loaded", callback )
}

function purgeUserPrefs() {
    if ( typeof(Storage) !== "undefined" )
        window.localStorage.removeItem( 'go_default_prefs' )
}

function focusTerminal() {
    GateOne.Terminal.Input.capture()
    $( '.✈terminal' ).click()
}

module.exports = {
    init: init
}