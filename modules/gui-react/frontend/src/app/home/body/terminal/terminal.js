import React from 'react'
import './gateone'
import './gateone.css'
import Http from 'http-client'
import {currentUser} from 'user'
import {connect} from 'store'

let terminalId = null

const mapStateToProps = () => ({
    username: currentUser().username
})

class Terminal extends React.Component {
    componentWillMount() {
        Http.get$('/api/gateone/auth-object')
            .subscribe(e => this.initTerminal(e.response.authObject))
    }

    render() {
        return (
            <div id='gateone'/>
        )
    }

    /* eslint-disable */
    initTerminal(auth) {
        this.purgeUserPrefs()
        GateOne.Events.on('go:js_loaded', this.createGateOneTerminal.bind(this))
        GateOne.init({
            url: `https://${window.location.host}/gateone`,
            auth: auth,
            embedded: true
        })
    }

    newTerminal() {
        terminalId = GateOne.Terminal.newTerminal(this.randomTerminalId())
        GateOne.Terminal.setTerminal(terminalId)
        GateOne.Terminal.clearScrollback(terminalId)
        GateOne.Terminal.sendString(
            `ssh://${this.props.username}@ssh-gateway?identities=id_rsa\n`,
            terminalId
        )
    }

    createGateOneTerminal() {
        if (terminalId || GateOne.Terminal == null)
            return

        if (GateOne.Terminal.closeTermCallbacks.length === 0)
            GateOne.Terminal.closeTermCallbacks.push(this.newTerminal)
        // Avoid printing host fingerprints on the browser console
        GateOne.Net.addAction('terminal:sshjs_display_fingerprint', () => {})
        GateOne.Logging.setLevel('ERROR')
        this.newTerminal()
    }

    purgeUserPrefs() {
        if (typeof Storage !== 'undefined')
            window.localStorage.removeItem('go_default_prefs')
    }

    // focusTerminal() {
    //     if (terminalId) {
    //         GateOne.Terminal.Input.capture()
    //         $('.✈terminal').click()
    //     }
    // }

    randomTerminalId() {
        return Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER)) + 1
    }

}
export default Terminal = connect(mapStateToProps)(Terminal)

