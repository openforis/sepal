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

// gateOne terminal Id
var terminalId = null

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

function initTerminal( response ) {
    purgeUserPrefs()
    
    var createGateOneTerminal = function () {
        var newTerminal = function () {
            terminalId = GateOne.Terminal.newTerminal()
            GateOne.Terminal.clearScrollback( terminalId )
            focusTerminal()
        }
    
        if ( GateOne.Terminal.closeTermCallbacks.length == 0 ) {
            GateOne.Terminal.closeTermCallbacks.push( newTerminal )
        }
        // avoid printing host fingerprints on the browser console
        GateOne.Net.addAction('terminal:sshjs_display_fingerprint', function(){} );
        GateOne.Logging.setLevel( 'ERROR' )
        newTerminal()
    }
    
    GateOne.Events.on( "go:js_loaded", createGateOneTerminal )
    
    var gateOnePrefs = {
        url     : 'https://' + window.location.host + '/gateone',
        // url           : 'https://172.28.128.3/gateone',
        autoConnectURL: 'ssh://' + Sepal.User.username + '@ssh-gateway?identities=id_rsa',
        auth          : response.authObject,
        embedded      : true
    }
    
    GateOne.init( gateOnePrefs )
}

function purgeUserPrefs() {
    if ( typeof(Storage) !== "undefined" )
        window.localStorage.removeItem( 'go_default_prefs' )
}

function focusTerminal() {
    if( terminalId ){
        GateOne.Terminal.Input.capture()
        $( '.✈terminal' ).click()
    }
}

EventBus.addEventListener( Events.SECTION.SHOWN, function ( e, section ) {
    if ( section == 'terminal' ) {
        focusTerminal()
    }
} )

module.exports = {
    init: init
}