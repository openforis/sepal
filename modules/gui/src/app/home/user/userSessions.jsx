import React from 'react'
import {interval} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {startCurrentUserSession$} from '~/user'
import {withActivatable} from '~/widget/activation/activatable'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {refreshSessions} from '~/widget/sessionMonitor'

import {InstancePicker} from '../body/apps/instancePicker'
import {UserSession} from './userSession'
import {UserSessionList} from './userSessionList'
import styles from './userSessions.module.css'

const mapStateToProps = () => ({
    selectedSessionId: select('ui.selectedSessionId')
})

// The report's costSinceCreation and timeoutHours are derived from elapsed time, so they
// drift between the session ws's event-driven pushes. This panel is the only place they are shown,
// and withActivatable unmounts it when closed, so the ticker costs nothing while it is shut.
const REFRESH_INTERVAL_MS = 10000

class _UserSessions extends React.Component {
    state = {
        picking: false
    }

    constructor(props) {
        super(props)
        this.pickInstance = this.pickInstance.bind(this)
        this.cancelPicking = this.cancelPicking.bind(this)
        this.startSession = this.startSession.bind(this)
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            interval(REFRESH_INTERVAL_MS).subscribe(() => refreshSessions())
        )
    }

    render() {
        const {selectedSessionId} = this.props
        const {picking} = this.state
        return picking
            ? this.renderPicker()
            : selectedSessionId
                ? <UserSession/>
                : this.renderSessions()
    }

    renderSessions() {
        const {stream, activatable: {deactivate}} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header
                    icon='server'
                    title={msg('user.report.sessions.title')}/>
                <Panel.Content>
                    <UserSessionList/>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Enter', 'Escape']}
                            onClick={deactivate}
                        />
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Add
                            busy={stream('START_USER_SESSION').active}
                            onClick={this.pickInstance}
                        />
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderPicker() {
        return (
            <InstancePicker
                onConfirm={this.startSession}
                onCancel={this.cancelPicking}
            />
        )
    }

    pickInstance() {
        this.setState({picking: true})
    }

    cancelPicking() {
        this.setState({picking: false})
    }

    // The picker offers no running instances without an app, so the pick is always a type. No
    // success toast: the new session appears in the list.
    startSession({instanceType}) {
        const {stream} = this.props
        this.setState({picking: false})
        stream('START_USER_SESSION',
            startCurrentUserSession$(instanceType),
            null,
            error => Notifications.error({message: msg('user.userSession.start.error'), error})
        )
    }
}

export const UserSessions = compose(
    _UserSessions,
    connect(mapStateToProps),
    withSubscriptions(),
    withActivatable({id: 'userSessions', policy: () => ({_: 'disallow'}), alwaysAllow: true})
)

UserSessions.propTypes = {}
