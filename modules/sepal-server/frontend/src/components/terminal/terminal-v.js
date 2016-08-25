/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
// var Sepal    = require( '../main/sepal' )
var UserMV   = require( '../user/user-mv' )

require( './gateone' )
require( './gateone.css' )

// html
var template = require( './terminal.html' )
var html     = null

// gateOne terminal Id
var terminalId = null

var init = function () {
    html           = $( template( {} ) )
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

function initTerminal( response ) {
    purgeUserPrefs()
    
    var createGateOneTerminal = function () {
        if ( terminalId )
            return
        var newTerminal = function () {
            terminalId = GateOne.Terminal.newTerminal( randomTerminalId() )
            GateOne.Terminal.setTerminal( terminalId )
            GateOne.Terminal.clearScrollback( terminalId )
            GateOne.Terminal.sendString( 'ssh://' + UserMV.getCurrentUser().username + '@ssh-gateway?identities=id_rsa\n', terminalId )
            focusTerminal()
        }
        
        if ( GateOne.Terminal.closeTermCallbacks.length == 0 ) {
            GateOne.Terminal.closeTermCallbacks.push( newTerminal )
        }
        // Avoid printing host fingerprints on the browser console
        GateOne.Net.addAction( 'terminal:sshjs_display_fingerprint', function () {
        } );
        GateOne.Logging.setLevel( 'ERROR' )
        newTerminal()
    }
    
    var gateOnePrefs = {
        url     : 'https://' + window.location.host + '/gateone',
        // url     : 'https://vagrant/gateone',
        auth    : response.authObject,
        embedded: true
    }
    
    GateOne.Events.on( "go:js_loaded", createGateOneTerminal )
    GateOne.init( gateOnePrefs )
}

function purgeUserPrefs() {
    if ( typeof(Storage) !== "undefined" )
        window.localStorage.removeItem( 'go_default_prefs' )
}

function focusTerminal() {
    if ( terminalId ) {
        GateOne.Terminal.Input.capture()
        $( '.✈terminal' ).click()
    }
}

function randomTerminalId() {
    return Math.floor( Math.random() * (Number.MAX_SAFE_INTEGER) ) + 1
}

EventBus.addEventListener( Events.SECTION.SHOWN, function ( e, section ) {
    if ( section == 'terminal' ) {
        focusTerminal()
    }
} )

module.exports = {
    init: init
}