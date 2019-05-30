import {ActivationContext} from 'widget/activation/activationContext'
import {PortalContainer} from 'widget/portal'
import {compose} from 'compose'
import {connect} from 'store'
import {exhaustMap, map} from 'rxjs/operators'
import {isFloating} from './menu/menuMode'
import {timer} from 'rxjs'
import Body from './body/body'
import Footer from './footer/footer'
import Map from './map/map'
import Menu from './menu/menu'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'
import styles from './home.module.css'

const mapStateToProps = () => ({
    floatingMenu: isFloating(),
    floatingFooter: false
})

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
        })
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
    constructor(props) {
        super(props)
        const {stream} = props
        stream('SCHEDULE_UPDATE_USER_REPORT', updateUserReport$())
        stream('SCHEDULE_UPDATE_USER_MESSAGES', updateUserMessages$())
        stream('SCHEDULE_UPDATE_TASKS', updateTasks$())
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
                    <Map className={styles.map}/>
                    <Menu className={styles.menu}/>
                    <div className={styles.main}>
                        <Body className={styles.body}/>
                        <div className={styles.google}></div>
                        <Footer className={styles.footer}/>
                    </div>
                    <PortalContainer/>
                </div>
            </ActivationContext>
        )
    }
}

Home.propTypes = {
    floatingFooter: PropTypes.bool.isRequired,
    floatingMenu: PropTypes.bool.isRequired
}

export default compose(
    Home,
    connect(mapStateToProps)
)
