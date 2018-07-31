import api from 'backend'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {currentUser} from 'user'
// import './gateone'
import './gateone.css'

let terminalId = null

const mapStateToProps = () => ({
    username: currentUser().username
})

class Terminal extends React.Component {
    componentWillMount() {
        api.terminal.init$()
            .subscribe(({authObject}) => this.initTerminal(authObject))
    }

    render() {
        return (
            <div id='terminal'>
                <div className='container'>
                    <div id='gateone'/>
                </div>
            </div>
        )
    }

    /* eslint-disable */
    componentWillReceiveProps(nextProps, nextContext) {
        if (nextContext.active && terminalId) {
            GateOne.Terminal.Input.capture()
            const terminalElements = document.getElementsByClassName('✈terminal')
            terminalElements[0].click()
        }

    }

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
        setTimeout(() => {
            GateOne.Visual.updateDimensions(true)
        }, 10000) // Hack to get terminal size correct.
    }

    createGateOneTerminal() {
        if (terminalId || GateOne.Terminal == null)
            return

        GateOne.Logging.setLevel('ERROR')
        if (GateOne.Terminal.closeTermCallbacks.length === 0)
            GateOne.Terminal.closeTermCallbacks.push(this.newTerminal.bind(this))
        // Avoid printing host fingerprints on the browser console
        GateOne.Net.addAction('terminal:sshjs_display_fingerprint', () => null)
        this.newTerminal()
    }

    purgeUserPrefs() {
        if (typeof Storage !== 'undefined')
            window.localStorage.removeItem('go_default_prefs')
    }

    randomTerminalId() {
        return Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER)) + 1
    }

}

Terminal.contextTypes = {
    active: PropTypes.bool
}

export default connect(mapStateToProps)(Terminal)