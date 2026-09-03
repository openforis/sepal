import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Tabs} from '~/widget/tabs/tabs'

import {App} from './app'
import {sessionNumber} from './instanceSuitability'

const log = getLogger('apps')

const mapStateToProps = state => ({
    sessions: selectFrom(state, 'user.currentUserReport.sessions')
})

// createTabPrefix — a per-session-list-memoized factory of the Tabs `tabPrefix` prop:
// ({sessionId}) => 'N:' — the session's 1-based instance number, matching the
// InstancePicker and the terminal menu.
// The IDENTITY contract is load-bearing: Tabs is a PURE connected widget mapping only
// apps.tabs/selectedTabId, and every other prop it receives is identity-stable — so a
// report-only store change (the ws push that first lists a fresh session) re-renders
// the tab handles ONLY because this prop's identity changes with the session list.
// A plain bound method left freshly stamped tabs numberless until an unrelated tabs
// mutation. Same list → same function, so unrelated re-renders stay blocked.
export const createTabPrefix = () => {
    let lastSessions, lastTabPrefix
    return sessions => {
        if (sessions !== lastSessions || !lastTabPrefix) {
            lastSessions = sessions
            lastTabPrefix = ({sessionId}) => {
                const number = sessionNumber(sessions, sessionId)
                return number ? `${number}:` : undefined
            }
        }
        return lastTabPrefix
    }
}

class _Apps extends React.Component {
    constructor(props) {
        super(props)
        this.renderApp = this.renderApp.bind(this)
        this.isLandingTab = this.isLandingTab.bind(this)
        this.onCloseTab = this.onCloseTab.bind(this)
        this.tabPrefixFor = createTabPrefix()
    }

    render() {
        const {sessions} = this.props
        return (
            <Tabs
                label={msg('home.sections.app-launch-pad')}
                statePath='apps'
                isLandingTab={this.isLandingTab}
                tabPrefix={this.tabPrefixFor(sessions)}
                onClose={this.onCloseTab}>
                {this.renderApp}
            </Tabs>
        )
    }

    renderApp({id}) {
        return (
            <App id={id}/>
        )
    }

    isLandingTab({path}) {
        return !path
    }

    onCloseTab({path, sessionId}, close) {
        if (path && sessionId) {
            // Unbind the app from its instance so it can be re-opened on a different one
            // (or a second copy started elsewhere). Fire-and-forget: closing the tab must
            // not wait on — or fail with — the release request.
            api.apps.releaseSession$(path).subscribe({
                error: error => log.warn(`Failed to release app session for ${path}`, error)
            })
        }
        close()
    }
}

export const Apps = compose(
    _Apps,
    connect(mapStateToProps)
)
