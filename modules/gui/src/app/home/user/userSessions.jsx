import React from 'react'
import {catchError, forkJoin, interval, map, of} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {startCurrentUserSession$, stopCurrentUserSession$} from '~/user'
import {withActivatable} from '~/widget/activation/activatable'
import {ModalConfirmationButton} from '~/widget/modalConfirmationButton'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {refreshSessions} from '~/widget/sessionMonitor'

import {InstancePicker} from '../body/apps/instancePicker'
import {UserSession} from './userSession'
import {UserSessionList} from './userSessionList'
import styles from './userSessions.module.css'
import {instanceTypeLabel, runningItems} from './userSessionSummary'

const mapStateToProps = () => ({
    selectedSessionId: select('ui.selectedSessionId'),
    sessions: select('user.currentUserReport.sessions')
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
        this.stopAllSessions = this.stopAllSessions.bind(this)
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
        const {sessions, stream, activatable: {deactivate}} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header
                    icon='server'
                    title={msg('user.report.sessions.title')}
                    label={msg('user.report.sessions.active', {count: sessions?.length ?? 0})}/>
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
                            label={msg('user.userSession.start.label')}
                            busy={stream('START_USER_SESSION').active}
                            onClick={this.pickInstance}
                        />
                        {this.renderStopAll()}
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderStopAll() {
        const {sessions, stream} = this.props
        const count = sessions?.length ?? 0
        return (
            <ModalConfirmationButton
                look='cancel'
                icon='trash'
                label={msg('user.userSession.stopAll.label')}
                confirmLabel={msg('user.userSession.stopAll.label')}
                message={msg('user.userSession.stopAll.message', {count})}
                busy={stream('STOP_ALL_USER_SESSIONS').active}
                disabled={!count}
                onConfirm={this.stopAllSessions}>
                {this.renderStopAllList()}
            </ModalConfirmationButton>
        )
    }

    // Each instance by the name the list titles it with, and what closes with it.
    renderStopAllList() {
        const {sessions} = this.props
        return (
            <ul>
                {(sessions || []).map(session => {
                    const apps = runningItems(session).map(({label}) => label)
                    return (
                        <li key={session.id}>
                            {[session.name || instanceTypeLabel(session), apps.join(', ')].filter(Boolean).join(' — ')}
                        </li>
                    )
                })}
            </ul>
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

    // One failed stop does not keep the others running: each is stopped on its own, and failures are
    // reported once at the end. Stopped sessions leave the list as they go.
    stopAllSessions() {
        const {sessions, stream} = this.props
        stream('STOP_ALL_USER_SESSIONS',
            forkJoin(sessions.map(session =>
                stopCurrentUserSession$(session).pipe(
                    map(() => null),
                    catchError(error => of(error))
                )
            )),
            results => {
                const [error] = results.filter(Boolean)
                error && Notifications.error({message: msg('user.userSession.stopAll.error'), error})
            }
        )
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
