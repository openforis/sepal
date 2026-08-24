import React from 'react'
import {interval, Subject} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {refreshBudget} from '~/widget/budgetMonitor'
import {hasBudget, hourlyInstanceSpending, isBudgetWarning} from '~/widget/budgetRules'
import {Button} from '~/widget/button'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {refreshSessions} from '~/widget/sessionMonitor'
import {Widget} from '~/widget/widget'

import styles from './usage.module.css'
import {BudgetUpdateRequest} from './userBudgetUpdateRequest'
import {UserResources} from './userResources'
import {UserSession} from './userSession'
import {UserSessions} from './userSessions'

const mapStateToProps = () => ({
    user: select('user.currentUser'),
    userReport: select('user.currentUserReport'),
    selectedSessionId: select('ui.selectedSessionId')
})

// The report's costSinceCreation and timeoutHours are derived from elapsed time, so they
// drift between the session ws's event-driven pushes. This panel is the only place they are shown,
// and withActivatable unmounts it when closed, so the ticker costs nothing while it is shut.
const REFRESH_INTERVAL_MS = 10000

class _Usage extends React.Component {
    state = {
        requestBudgetUpdate: false
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            interval(REFRESH_INTERVAL_MS).subscribe(() => refreshSessions())
        )
    }

    renderOverview() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header
                    icon='user'
                    title={msg('user.report.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderResosurces()}
                        {this.renderSessions()}
                    </Layout>
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
                            label={msg('user.report.updateQuota')}
                            icon='pencil-alt'
                            onClick={() => this.setState({requestBudgetUpdate: true})}
                        />
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderResosurces() {
        return (
            <Widget label={msg('user.report.resources.title')} framed>
                <UserResources/>
            </Widget>
        )
    }

    renderSessions() {
        return (
            <Widget label={msg('user.report.sessions.title')} framed>
                <UserSessions/>
            </Widget>
        )
    }

    renderSession() {
        return (
            <UserSession/>
        )
    }

    renderRequestBudgetUpdate() {
        return (
            <BudgetUpdateRequest onClose={() => this.setState({requestBudgetUpdate: false})}/>
        )
    }

    render() {
        const {selectedSessionId} = this.props
        const {requestBudgetUpdate} = this.state
        return requestBudgetUpdate
            ? this.renderRequestBudgetUpdate()
            : selectedSessionId
                ? this.renderSession()
                : this.renderOverview()
    }
}

const policy = () => ({
    _: 'disallow'
})

const Usage = compose(
    _Usage,
    connect(mapStateToProps),
    withSubscriptions(),
    withActivatable({id: 'userReport', policy, alwaysAllow: true})
)

Usage.propTypes = {}

const hint$ = new Subject()

class _UsageButton extends React.Component {
    state = {
        hint: false
    }

    render() {
        return (
            <React.Fragment>
                <Usage/>
                {this.renderButton()}
            </React.Fragment>
        )
    }

    renderButton() {
        const {userReport: {spending, sessions}, budgetExceeded, activator: {activatables: {userReport: {active, activate}}}} = this.props
        const {hint} = this.state
        const hourlySpending = hourlyInstanceSpending(sessions)
        const budgeted = hasBudget(spending)
        const label = budgeted && budgetExceeded
            ? msg('home.sections.user.report.budgetExceeded')
            : format.unitsPerHour(hourlySpending)
        const additionalClassName = budgeted
            ? budgetExceeded
                ? styles.budgetExceeded
                : isBudgetWarning(spending, hourlySpending)
                    ? styles.budgetWarning
                    : null
            : null

        return (
            <Button
                chromeless
                look='transparent'
                size='large'
                air='less'
                additionalClassName={additionalClassName}
                icon='dollar-sign'
                label={label}
                disabled={active}
                tooltip={msg('home.sections.user.report.tooltip')}
                tooltipPlacement='top'
                tooltipDisabled={active}
                hint={hint}
                onClick={() => {
                    refreshBudget()
                    refreshSessions()
                    activate()
                }}
            />

        )
    }

    initializeHints() {
        const {addSubscription} = this.props
        addSubscription(
            hint$.subscribe(hint => this.setState({hint}))
        )
    }

    componentDidMount() {
        this.initializeHints()
    }
}

export const UsageButton = compose(
    _UsageButton,
    connect(state => ({
        userReport: (state.user && state.user.currentUserReport) || {},
        budgetExceeded: select('user.budgetExceeded'),
    })),
    withSubscriptions(),
    withActivators('userReport')
)

export const usageHint = visible =>
    hint$.next(visible)
