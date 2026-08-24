import React from 'react'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {getLogger} from '~/log'
import {withSubscriptions} from '~/subscription'

const log = getLogger('sessionMonitor')

let sessionWs = null

// refreshSessions — ask the worker for a fresh session report. The report's costSinceCreation and
// timeoutHours are derived from elapsed time, so they drift between event-driven pushes
// with nothing to announce it; the Usage panel ticks this while it is open (see
// app/home/user/usage.jsx) and the usage button fires one on open.
export const refreshSessions = () =>
    sessionWs && sessionWs.upstream$.next({refresh: true})

class _SessionMonitor extends React.Component {
    sessions = api.sessions.ws()

    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        sessionWs = this.sessions
        addSubscription(
            this.sessions.downstream$.subscribe({
                next: msg => this.onMessage(msg),
                error: error => log.error('downstream$ error', error),
                complete: () => log.error('downstream$ complete')
            })
        )
    }

    componentWillUnmount() {
        sessionWs = null
    }

    onMessage({data}) {
        data !== undefined && this.onData(data)
    }

    // Set the sessions subkey, NOT the whole currentUserReport, so the spending/budgetUpdateRequest
    // keys merged in by the BudgetMonitor are preserved. instanceTypes is not pushed — it is static
    // config, and the only consumer (the instance picker) fetches it with the REST report.
    onData({sessions}) {
        actionBuilder('UPDATE_USER_SESSIONS')
            .set('user.currentUserReport.sessions', sessions)
            .dispatch()
    }
}

export const SessionMonitor = compose(
    _SessionMonitor,
    withSubscriptions()
)
