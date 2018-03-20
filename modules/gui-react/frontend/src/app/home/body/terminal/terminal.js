import React from 'react'
import './gateone'
import './gateone.css'
import Http from 'http-client'

export default class Terminal extends React.Component {
    componentWillMount() {
        Http.get$('/api/gateone/auth-object')
            .subscribe(e => initTerminal(e.response.authObject))
    }

    render() {
        return (
            <div>
                <h1>Terminal</h1>
                <div id='gateone' style={{height: '200px', background: 'red'}}/>
            </div>
        )
    }
}

let terminalId = null

/* eslint-disable */
function initTerminal(auth) {
    purgeUserPrefs()
    GateOne.Events.on('go:js_loaded', createGateOneTerminal)
    GateOne.init({
        url: `https://${window.location.host}/gateone`,
        auth: auth,
        embedded: true
    })
}

function createGateOneTerminal() {
    if (terminalId || GateOne.Terminal == null)
        return

    function newTerminal() {
        terminalId = GateOne.Terminal.newTerminal(randomTerminalId())
        GateOne.Terminal.setTerminal(terminalId)
        GateOne.Terminal.clearScrollback(terminalId)
        GateOne.Terminal.sendString(
            `ssh://${UserMV.getCurrentUser().username}@ssh-gateway?identities=id_rsa`,
            terminalId
        )
        focusTerminal()
    }

    if (GateOne.Terminal.closeTermCallbacks.length === 0) {
        GateOne.Terminal.closeTermCallbacks.push(newTerminal)
    }
    // Avoid printing host fingerprints on the browser console
    GateOne.Net.addAction('terminal:sshjs_display_fingerprint', () => {})
    GateOne.Logging.setLevel('ERROR')
    newTerminal()
}

function purgeUserPrefs() {
    if (typeof Storage !== 'undefined')
        window.localStorage.removeItem('go_default_prefs')
}

function focusTerminal() {
    if (terminalId) {
        GateOne.Terminal.Input.capture()
        $('.✈terminal').click()
    }
}

function randomTerminalId() {
    return Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER)) + 1
}
