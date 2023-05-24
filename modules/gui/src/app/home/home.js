import {ActivationContext} from 'widget/activation/activationContext'
import {PortalContainer} from 'widget/portal'
import {catchError, exhaustMap, map, mergeMap, of, pipe, range, retryWhen, throwError, timer, zip} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getLogger} from 'log'
import {isFloating} from './menu/menuMode'
import {msg} from 'translate'
import Body from './body/body'
import Footer from './footer/footer'
import Menu from './menu/menu'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'
import moment from 'moment'
import styles from './home.module.css'

const log = getLogger('schedule')

const mapStateToProps = () => ({
    floatingMenu: isFloating(),
    floatingFooter: false
})

const timedRefresh$ = (api$, refreshSeconds = 60, name) =>
    timer(0, refreshSeconds * 1000).pipe(
        exhaustMap(() => api$()),
        retry({description: `Failed to refresh ${name}`})
    )

const updateUserReport$ = () =>
    timedRefresh$(api.user.loadCurrentUserReport$, 10, 'user report').pipe(
        map(currentUserReport => {
            const projectedStorageSpending = projectStorageSpending(currentUserReport.spending)
            currentUserReport.spending.projectedStorageSpending = projectedStorageSpending
            return actionBuilder('UPDATE_CURRENT_USER_REPORT')
                .set('user.currentUserReport', currentUserReport)
                .set('user.hasBudget', hasBudget(currentUserReport))
                .set('user.budgetExceeded', isBudgetExceeded(currentUserReport))
                .set('user.budgetWarning', projectedStorageSpending > currentUserReport.spending.monthlyStorageBudget)
                .dispatch()
        })
    )

const projectStorageSpending = spending => {
    const storageUsed = spending.storageUsed
    const costPerGbMonth = spending.costPerGbMonth
    const today = moment().date()
    const lastOfMonth = moment().endOf('month').date()
    const fractionLeftOfMonth = 1 - today / lastOfMonth
    const storageCostForRestOfMonth = storageUsed * costPerGbMonth * fractionLeftOfMonth
    const monthlyStorageSpending = spending.monthlyStorageSpending
    return monthlyStorageSpending + storageCostForRestOfMonth
}

const isBudgetExceeded = currentUserReport => {
    const {
        monthlyInstanceBudget, monthlyInstanceSpending,
        monthlyStorageBudget, monthlyStorageSpending,
        storageQuota, storageUsed
    } = currentUserReport.spending
    return monthlyInstanceSpending >= monthlyInstanceBudget
        || monthlyStorageSpending >= monthlyStorageBudget
        || storageUsed >= storageQuota
}

const hasBudget = currentUserReport => {
    const {
        monthlyInstanceBudget,
        monthlyStorageBudget,
        storageQuota
    } = currentUserReport.spending
    return monthlyInstanceBudget > 0
        || monthlyStorageBudget > 0
        || storageQuota > 0
}

const updateUserMessages$ = () =>
    timedRefresh$(api.user.loadUserMessages$, 60, 'user messages').pipe(
        map(userMessages =>
            actionBuilder('UPDATE_USER_MESSAGES')
                .set('user.userMessages', userMessages)
                .dispatch()
        )
    )

const updateTasks$ = () =>
    timedRefresh$(api.tasks.loadAll$, 5, 'tasks').pipe(
        map(tasks =>
            actionBuilder('UPDATE_TASKS')
                .set('tasks', tasks)
                .dispatch()
        )
    )

class Home extends React.Component {
    constructor(props) {
        super(props)
        const {stream} = props
        const errorHandler = () => Notifications.error({message: msg('home.connectivityError')})
        stream('SCHEDULE_UPDATE_USER_REPORT', updateUserReport$(), null, errorHandler)
        stream('SCHEDULE_UPDATE_USER_MESSAGES', updateUserMessages$(), null, errorHandler)
        stream('SCHEDULE_UPDATE_TASKS', updateTasks$(), null, errorHandler)
    }

    render() {
        const {floatingMenu, floatingFooter} = this.props
        return (
            <ActivationContext id='root'>
                <div className={[
                    styles.container,
                    floatingMenu && styles.floatingMenu,
                    floatingFooter && styles.floatingFooter
                ].join(' ')}>
                    <Menu className={styles.menu}/>
                    <div className={styles.main}>
                        <Body className={styles.body}/>
                        <Footer className={styles.footer}/>
                    </div>
                    <PortalContainer/>
                </div>
            </ActivationContext>
        )
    }
}

const retry = ({minDelay = 500, maxDelay = 30000, exponentiality = 2, description} = {}) => pipe(
    retryWhen(error$ =>
        zip(
            error$,
            timer(0, 0)
        ).pipe(
            mergeMap(
                ([error, retry]) => {
                    const exponentialBackoff = Math.pow(exponentiality, retry) * minDelay
                    const cappedExponentialBackoff = Math.min(exponentialBackoff, maxDelay)
                    console.error(`Retrying ${description ? `${description} ` : ''}(${retry}) in ${cappedExponentialBackoff}ms`, error)
                    return timer(cappedExponentialBackoff)
                }
            )
        )
    )
)

Home.propTypes = {
    floatingFooter: PropTypes.bool.isRequired,
    floatingMenu: PropTypes.bool.isRequired
}

export default compose(
    Home,
    connect(mapStateToProps)
)
