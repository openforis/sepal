import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {forkJoin} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {appList} from '~/apps'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {msg} from '~/translate'
import {Confirm} from '~/widget/confirm'
import {Notifications} from '~/widget/notifications'
import {closeTab} from '~/widget/tabs/tabActions'

import {AppInstance} from './appInstance'
import {AppList} from './appList/appList'
import {conflictingAssociations, openPlan} from './appOpenPlan'
import {InstancePicker} from './instancePicker'
import {sessionNumber} from './instanceSuitability'

const log = getLogger('app')

// "instance 2 (m4)" — the same 1-based numbering and instance type tag the instance
// picker and the sessions panel show.
const instanceLabel = (sessions, sessionId) => {
    const number = sessionNumber(sessions, sessionId)
    const instanceType = (sessions || []).find(({id}) => id === sessionId)?.instanceType
    const type = instanceType?.tag ?? instanceType?.name
    return number && type
        ? msg('apps.confirmReopen.instance', {number, type})
        : msg('apps.confirmReopen.unknownInstance')
}

const appLabel = ({label, path}) => label || path

const mapStateToProps = state => ({
    runningApps: selectFrom(state, 'apps.tabs')
})

const SANDBOX_ENDPOINTS = ['shiny', 'jupyter', 'rstudio']

class _App extends React.Component {
    state = {
        app: null,
        picker: null,
        selection: null,
        confirm: null
    }

    constructor(props) {
        super(props)
        this.runApp = this.runApp.bind(this)
        this.onSession = this.onSession.bind(this)
        this.onPickerConfirm = this.onPickerConfirm.bind(this)
        this.onPickerCancel = this.onPickerCancel.bind(this)
        this.onConfirmReopen = this.onConfirmReopen.bind(this)
        this.onCancelReopen = this.onCancelReopen.bind(this)
    }

    render() {
        return (
            <React.Fragment>
                {this.renderContent()}
                {this.renderPicker()}
                {this.renderConfirm()}
            </React.Fragment>
        )
    }

    renderContent() {
        const {app, selection} = this.state
        return app
            ? <AppInstance app={app} selection={selection} onSession={this.onSession}/>
            : <AppList onSelect={this.runApp}/>
    }

    // The picker is a modal overlay: the content (app list or running app) stays visible
    // behind it.
    renderPicker() {
        const {picker} = this.state
        return picker
            ? <InstancePicker app={picker} onConfirm={this.onPickerConfirm} onCancel={this.onPickerCancel}/>
            : null
    }

    // Confirmation before a takeover/move: the app (or its group-mates) will be closed
    // where currently open, then reopened on the picked instance.
    renderConfirm() {
        const {confirm} = this.state
        if (!confirm) {
            return null
        }
        return (
            <Confirm
                title={msg('apps.confirmReopen.title')}
                message={this.confirmMessage(confirm)}
                onConfirm={this.onConfirmReopen}
                onCancel={this.onCancelReopen}/>
        )
    }

    // Each conflict reads differently to the user: the same app open in another browser
    // window, the same app open on another instance, or only group-mates, which have to
    // move along with it. Lines are separated by '|'.
    confirmMessage({app, plan, instance}) {
        if (plan.reason === 'otherBrowser') {
            return msg('apps.confirmReopen.otherBrowser', {app: app.label})
        }
        if (plan.reason === 'otherInstance') {
            const alsoClosing = plan.closing.filter(({path}) => path !== app.path)
            return [
                msg('apps.confirmReopen.otherInstance', {app: app.label, instance}),
                ...alsoClosing.length
                    ? [msg('apps.confirmReopen.alsoClosing', {apps: alsoClosing.map(appLabel).join(', ')})]
                    : []
            ].join('|')
        }
        return msg('apps.confirmReopen.group', {
            app: app.label,
            apps: plan.closing.map(appLabel).join(', '),
            count: plan.closing.length,
            instance
        })
    }

    needsInstance(app) {
        return SANDBOX_ENDPOINTS.includes(app.endpoint)
    }

    runApp(app) {
        const {id, runningApps} = this.props
        if (!this.needsInstance(app)) {
            // Docker apps are unrestricted — isolated per-copy containers, any number of
            // copies. Only a `single` app's open tab is focused rather than duplicated.
            const runningApp = _.find(runningApps, runningApp => runningApp.path === app.path)
            if (app.single && runningApp) {
                closeTab(id, 'apps', runningApp.id)
                return
            }
            this.openApp(app, null)
            return
        }
        // Sandbox apps always go through the picker; the pick decides whether this is a
        // plain open, a focus of an already-open tab, or a confirmed takeover/move
        // (onPickerConfirm).
        this.setState({picker: app})
    }

    openApp(app, selection) {
        const {id} = this.props
        this.setState({app, picker: null, selection})
        actionBuilder('SET_TAB_PLACEHOLDER', {id, app})
            .assign(['apps.tabs', {id}], {
                placeholder: app.label,
                title: app.label,
                path: app.path
            })
            .dispatch()
    }

    onPickerConfirm(selection) {
        const {picker} = this.state
        const {id, runningApps} = this.props
        // NOTE: the report is websocket-pushed, but a just-created association (another
        // tab/browser, ~100ms debounce) can still be missed and no confirmation asked.
        // That is safe: the gateway ignores the pick (the association wins), returns
        // `reused: true`, and onSession() surfaces a notification — the app still opens
        // on its current instance.
        const sessions = select('user.currentUserReport.sessions')
        const conflicts = conflictingAssociations(picker, appList(), sessions)
        const plan = openPlan({app: picker, selection, conflicts, tabs: runningApps})
        if (plan.action === 'focus') {
            // Already open in this browser on the picked instance — close this (new) tab
            // and select the running one.
            this.setState({picker: null})
            closeTab(id, 'apps', plan.tabId)
            return
        }
        if (plan.action === 'confirm') {
            this.setState({picker: null, confirm: {
                app: picker,
                selection,
                plan,
                instance: instanceLabel(sessions, plan.sessionId)
            }})
            return
        }
        this.openApp(picker, selection)
    }

    onPickerCancel() {
        this.setState({picker: null})
    }

    onConfirmReopen() {
        const {confirm: {app, selection, plan}} = this.state
        this.setState({confirm: null})
        // Close OUR conflicting tabs directly (bypassing the Tabs onClose hook — the
        // explicit release below already dissociates; no duplicate request).
        plan.toCloseLocal.forEach(tabId => closeTab(tabId, 'apps'))
        // Dissociate every conflicting association BEFORE starting: the worker's
        // association-wins rule would otherwise steer the start back to the old instance.
        // Other browsers' tabs close via the appSessionDissociated push.
        forkJoin(plan.toRelease.map(path => api.apps.releaseSession$(path))).subscribe({
            next: () => this.openApp(app, selection),
            error: error => {
                log.error('Failed to release conflicting app sessions', error)
                Notifications.error({message: msg('apps.confirmReopen.releaseFailed'), timeout: 8})
            }
        })
    }

    onCancelReopen() {
        this.setState({confirm: null})
    }

    onSession(session) {
        const {id} = this.props
        actionBuilder('SET_TAB_SESSION', {id, sessionId: session.id})
            .set(['apps.tabs', {id}, 'sessionId'], session.id)
            .dispatch()
        if (session.reused) {
            // The gateway ignored the pick because the app is associated with another
            // instance (a race the plan missed) — tell the user.
            Notifications.info({message: msg('apps.instancePicker.alreadyRunning'), timeout: 8})
        }
    }
}

export const App = compose(
    _App,
    connect(mapStateToProps)
)

App.propTypes = {
    id: PropTypes.string.isRequired,
}
