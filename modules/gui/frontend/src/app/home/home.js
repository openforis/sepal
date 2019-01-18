import actionBuilder from 'action-builder'
import api from 'api'
import PropTypes from 'prop-types'
import React from 'react'
import {EMPTY, interval, timer} from 'rxjs'
import {delay, exhaustMap, map, switchMap} from 'rxjs/operators'
import {connect} from 'store'
import {currentUser, loadCurrentUser$} from 'user'
import Body from './body/body'
import Footer from './footer/footer'
import styles from './home.module.css'
import Map from './map/map'
import Menu from './menu/menu'
import {isFloating} from './menu/menuMode'

const mapStateToProps = () => ({
    floatingMenu: isFloating(),
    floatingFooter: false,
    user: currentUser()
})

const refreshUserAccessTokens$ = user => {
    const oneMinute = 60 * 1000
    const minRefreshTime = oneMinute
    const maxRefreshTime = 20 * oneMinute
    const calculateDelayMillis = expiryDate =>
        Math.min(maxRefreshTime, Math.max(minRefreshTime, expiryDate - 5 * oneMinute - Date.now()))
    return interval(0).pipe(
        delay(calculateDelayMillis(user.googleTokens.accessTokenExpiryDate)),
        exhaustMap(() => loadCurrentUser$().pipe(
            map(currentUserAction => {
                currentUserAction.dispatch()
                return currentUserAction.user.googleTokens.accessTokenExpiryDate
            }),
            map(calculateDelayMillis),
            switchMap(delayMillis => EMPTY.pipe(delay(delayMillis))
            )
        ))
    )
}

const timedRefresh$ = (api$, refreshSeconds = 60) =>
    timer(0, refreshSeconds * 1000).pipe(
        exhaustMap(() => api$())
    )

const updateUserReport$ = () =>
    timedRefresh$(api.user.loadCurrentUserReport$, 10).pipe(
        map(currentUserReport => {
                return actionBuilder('UPDATE_CURRENT_USER_REPORT')
                    .set('user.currentUserReport', currentUserReport)
                    .set('user.budgetExceeded', isBudgetExceeded(currentUserReport))
                    .dispatch()

            }
        )
    )

const isBudgetExceeded = currentUserReport => {
    const {
        monthlyInstanceBudget, monthlyInstanceSpending,
        monthlyStorageBudget, monthlyStorageSpending,
        storageQuota, storageUsed
    } = currentUserReport.spending
    return monthlyInstanceSpending > monthlyInstanceBudget
        || monthlyStorageSpending > monthlyStorageBudget
        || storageUsed > storageQuota
}

const updateUserMessages$ = () =>
    timedRefresh$(api.user.loadUserMessages$, 60).pipe(
        map(userMessages =>
            actionBuilder('UPDATE_USER_MESSAGES')
                .set('user.userMessages', userMessages)
                .dispatch()
        )
    )

const updateTasks$ = () =>
    timedRefresh$(api.tasks.loadAll$, 5).pipe(
        map(tasks =>
            actionBuilder('UPDATE_TASKS')
                .set('tasks', tasks)
                .dispatch()
        )
    )

class Home extends React.Component {
    UNSAFE_componentWillMount() {
        const {stream, user} = this.props
        stream('SCHEDULE_UPDATE_USER_REPORT', updateUserReport$())
        stream('SCHEDULE_UPDATE_USER_MESSAGES', updateUserMessages$())
        stream('SCHEDULE_UPDATE_TASKS', updateTasks$())
        user.googleTokens && stream('SCHEDULE_USER_INFO_REFRESH', refreshUserAccessTokens$(user))
    }

    render() {
        const {user, floatingMenu, floatingFooter} = this.props
        return (
            <div className={[
                styles.container,
                floatingMenu && styles.floatingMenu,
                floatingFooter && styles.floatingFooter
            ].join(' ')}>
                <Map className={styles.map}/>
                <Menu className={styles.menu} user={user}/>
                <div className={styles.main}>
                    <Body className={styles.body}/>
                    <Footer className={styles.footer} user={user}/>
                </div>
                <div id='portalContainer' className={styles.portalContainer}/>
            </div>
        )
    }
}

Home.propTypes = {
    floatingFooter: PropTypes.bool.isRequired,
    floatingMenu: PropTypes.bool.isRequired,
    user: PropTypes.object.isRequired
}

export default connect(mapStateToProps)(Home)
