import React from 'react'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {getLogger} from '~/log'
import {withSubscriptions} from '~/subscription'

import {isBudgetExceeded, projectStorageSpending} from './budgetRules'

const log = getLogger('budgetMonitor')

let budgetWs = null

// refreshBudget — ask the budget module for a fresh spending snapshot (used when the
// Usage dialog opens, so the gauges are exact when actually viewed)
export const refreshBudget = () =>
    budgetWs && budgetWs.upstream$.next({refresh: true})

class _BudgetMonitor extends React.Component {
    budget = api.budget.ws()

    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        budgetWs = this.budget
        addSubscription(
            this.budget.downstream$.subscribe({
                next: msg => this.onMessage(msg),
                error: error => log.error('downstream$ error', error),
                complete: () => log.error('downstream$ complete')
            })
        )
    }

    componentWillUnmount() {
        budgetWs = null
    }

    onMessage({data}) {
        data !== undefined && this.onData(data)
    }

    // budgetExceeded is stored because half the app reads it (menu, body, retrieve button). The
    // warning is not: it is one button's styling, derived from spending and the running sessions
    // together, and the button already re-renders on both.
    onData({spending, budgetUpdateRequest}) {
        actionBuilder('UPDATE_USER_SPENDING')
            .set('user.currentUserReport.spending', {
                ...spending,
                projectedStorageSpending: projectStorageSpending(spending)
            })
            .set('user.currentUserReport.budgetUpdateRequest', budgetUpdateRequest)
            .set('user.budgetExceeded', isBudgetExceeded(spending))
            .dispatch()
    }
}

export const BudgetMonitor = compose(
    _BudgetMonitor,
    withSubscriptions()
)
