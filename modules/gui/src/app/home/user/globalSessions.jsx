import React from 'react'
import {catchError, EMPTY, exhaustMap, interval, startWith} from 'rxjs'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {Icon} from '~/widget/icon'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'

import styles from './globalSessions.module.css'
import {UserSessionList} from './userSessionList'

// No push keeps every user's sessions current, so the panel polls while open; withActivatable
// unmounts it when closed.
const REFRESH_INTERVAL_MS = 10000

// Every user's open sessions, for admins. They can stop any of them, but start none.
class _GlobalSessions extends React.Component {
    state = {
        sessions: null,
        failed: false
    }

    constructor(props) {
        super(props)
        this.removeSession = this.removeSession.bind(this)
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            interval(REFRESH_INTERVAL_MS).pipe(
                startWith(0),
                exhaustMap(() => api.sessions.globalSessions$().pipe(
                    catchError(() => {
                        this.setState({failed: true})
                        return EMPTY
                    })
                ))
            ).subscribe(({sessions}) => this.setState({sessions, failed: false}))
        )
    }

    render() {
        const {activatable: {deactivate}} = this.props
        const {sessions} = this.state
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header
                    icon='network-wired'
                    title={msg('user.report.globalSessions')}
                    label={sessions?.length ? msg('user.report.sessions.active', {count: sessions.length}) : null}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Enter', 'Escape']}
                            onClick={deactivate}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    // A failed refresh keeps the last list it has: stale for a few seconds beats blank.
    renderContent() {
        const {sessions, failed} = this.state
        return sessions
            ? <UserSessionList global sessions={sessions} onStopped={this.removeSession}/>
            : failed
                ? <NoData message={msg('user.report.sessions.loadError')}/>
                : <Icon name='spinner'/>
    }

    removeSession({id}) {
        this.setState(({sessions}) => ({
            sessions: sessions.filter(session => session.id !== id)
        }))
    }
}

export const GlobalSessions = compose(
    _GlobalSessions,
    withSubscriptions(),
    withActivatable({id: 'globalSessions', policy: () => ({_: 'disallow'}), alwaysAllow: true})
)

GlobalSessions.propTypes = {}
