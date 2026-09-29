import React from 'react'
import {Subject} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {hasBudget, hourlyInstanceSpending, isBudgetWarning} from '~/widget/budgetRules'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './usage.module.css'
import {UsageMenuButton} from './usageMenu'
import {USAGE_DAYS, UsageStatistics} from './usageStatistics'
import {BudgetUpdateRequest} from './userBudgetUpdateRequest'
import {UserResources} from './userResources'
import {UserSessions} from './userSessions'

class _Usage extends React.Component {
    state = {
        requestBudgetUpdate: false
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
                        {this.renderResources()}
                        {this.renderStatistics()}
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

    renderResources() {
        return (
            <Widget label={msg('user.report.resources.title')} framed>
                <UserResources/>
            </Widget>
        )
    }

    renderStatistics() {
        return (
            <Widget label={msg('user.userDetails.form.usage.label', {days: USAGE_DAYS})} framed>
                <UsageStatistics/>
            </Widget>
        )
    }

    renderRequestBudgetUpdate() {
        return (
            <BudgetUpdateRequest onClose={() => this.setState({requestBudgetUpdate: false})}/>
        )
    }

    render() {
        const {requestBudgetUpdate} = this.state
        return requestBudgetUpdate
            ? this.renderRequestBudgetUpdate()
            : this.renderOverview()
    }
}

const policy = () => ({
    _: 'disallow'
})

const Usage = compose(
    _Usage,
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
                <UserSessions/>
                {this.renderButton()}
            </React.Fragment>
        )
    }

    renderButton() {
        const {userReport: {spending, sessions}, budgetExceeded} = this.props
        const {hint} = this.state
        const hourlySpending = hourlyInstanceSpending(sessions)
        const budgeted = hasBudget(spending)
        const label = budgeted && budgetExceeded
            ? msg('home.sections.user.report.budgetExceeded')
            : format.unitsPerHour(hourlySpending)
        const className = budgeted
            ? budgetExceeded
                ? styles.budgetExceeded
                : isBudgetWarning(spending, hourlySpending)
                    ? styles.budgetWarning
                    : null
            : null
        return (
            <UsageMenuButton
                className={className}
                label={label}
                hint={hint}
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
    withSubscriptions()
)

export const usageHint = visible =>
    hint$.next(visible)
