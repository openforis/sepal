import {EMPTY, interval, merge} from 'rxjs'
import {connect} from 'store'
import {currentUser, loadCurrentUser$} from 'user'
import {delay, exhaustMap, map, switchMap} from 'rxjs/operators'
import {isFloating} from './menu/menuMode'
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
    floatingFooter: false,
    user: currentUser()
})

const refreshUserAccessTokens$ = (user) => {
    const oneMinute = 60 * 1000
    const minRefreshTime = oneMinute
    const maxRefreshTime = 20 * oneMinute
    const calculateDelayMillis = (expiryDate) =>
        Math.min(maxRefreshTime, Math.max(minRefreshTime, expiryDate - 5 * oneMinute - Date.now()))
    return interval(0).pipe(
        delay(calculateDelayMillis(user.googleTokens.accessTokenExpiryDate)),
        exhaustMap(() => loadCurrentUser$().pipe(
            map(currentUserAction => {
                // console.log({currentUserAction})
                currentUserAction.dispatch()
                return currentUserAction.user.googleTokens.accessTokenExpiryDate
            }),
            map(calculateDelayMillis),
            switchMap((delayMillis) => EMPTY.pipe(delay(delayMillis))
            )
        ))
    )
}

const refreshUserReport$ = () =>  {
    const refreshSeconds = 10
    const loadCurrentUserReport$ = api.user.loadCurrentUserReport$()
    return merge(
        loadCurrentUserReport$,
        interval(refreshSeconds * 1000).pipe(
            exhaustMap(() => loadCurrentUserReport$)
        )
    ).pipe(
        map(currentUserReport =>
            actionBuilder('UPDATE_CURRENT_USER_REPORT')
                .set('user.currentUserReport', currentUserReport)
                .dispatch()
        )
    )
}

const updateTasks$ = () => {
    const refreshSeconds = 5
    const loadAll$ = api.tasks.loadAll$()
    return merge(
        loadAll$,
        interval(refreshSeconds * 1000).pipe(
            exhaustMap(() => loadAll$),
        )
    ).pipe(
        map(tasks =>
            actionBuilder('UPDATE_TASKS')
                .set('tasks', tasks)
                .dispatch()
        )
    )
}

class Home extends React.Component {
    UNSAFE_componentWillMount() {
        this.props.stream('SCHEDULE_USER_REPORT_REFRESH',
            refreshUserReport$()
        )
        // actionBuilder('UPDATE_CURRENT_USER_REPORT')
        //     .set('user.currentUserReport', _sampleUserReport)
        //     .dispatch()
        this.props.stream('SCHEDULE_UPDATE_TASKS',
            updateTasks$()
        )
        if (this.props.user.googleTokens) {
            this.props.stream('SCHEDULE_USER_INFO_REFRESH',
                refreshUserAccessTokens$(this.props.user)
            )
        }
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
                <Footer className={styles.footer} user={user}/>
                <Body className={styles.body}/>
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

const _sampleUserReport = {
    'sessions': [{
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-1',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'T2Small',
            'path': 'sandbox/instance-type/T2Small',
            'name': 't2.small',
            'description': '1 CPU / 2.0 GiB',
            'hourlyCost': 0.025
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-2',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'M3Medium',
            'path': 'sandbox/instance-type/M3Medium',
            'name': 'm3.medium',
            'description': '1 CPU / 3.75 GiB',
            'hourlyCost': 0.073
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-3',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'M44xlarge',
            'path': 'sandbox/instance-type/M44xlarge',
            'name': 'm4.4xlarge',
            'description': '16 CPU / 64.0 GiB',
            'hourlyCost': 0.95
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-4',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'R48xlarge',
            'path': 'sandbox/instance-type/R48xlarge',
            'name': 'r4.8xlarge',
            'description': '32 CPU / 244.0 GiB',
            'hourlyCost': 2.371
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }],
    'instanceTypes': [{
        'id': 'T2Small',
        'path': 'sandbox/instance-type/T2Small',
        'name': 't2.small',
        'description': '1 CPU / 2.0 GiB',
        'hourlyCost': 0.025
    }, {
        'id': 'M3Medium',
        'path': 'sandbox/instance-type/M3Medium',
        'name': 'm3.medium',
        'description': '1 CPU / 3.75 GiB',
        'hourlyCost': 0.073
    }, {
        'id': 'M4Large',
        'path': 'sandbox/instance-type/M4Large',
        'name': 'm4.large',
        'description': '2 CPU / 8.0 GiB',
        'hourlyCost': 0.119
    }, {
        'id': 'M4Xlarge',
        'path': 'sandbox/instance-type/M4Xlarge',
        'name': 'm4.xlarge',
        'description': '4 CPU / 16.0 GiB',
        'hourlyCost': 0.238
    }, {
        'id': 'M42xlarge',
        'path': 'sandbox/instance-type/M42xlarge',
        'name': 'm4.2xlarge',
        'description': '8 CPU / 32.0 GiB',
        'hourlyCost': 0.475
    }, {
        'id': 'M44xlarge',
        'path': 'sandbox/instance-type/M44xlarge',
        'name': 'm4.4xlarge',
        'description': '16 CPU / 64.0 GiB',
        'hourlyCost': 0.95
    }, {
        'id': 'M410xlarge',
        'path': 'sandbox/instance-type/M410xlarge',
        'name': 'm4.10xlarge',
        'description': '40 CPU / 160.0 GiB',
        'hourlyCost': 2.377
    }, {
        'id': 'M416xlarge',
        'path': 'sandbox/instance-type/M416xlarge',
        'name': 'm4.16xlarge',
        'description': '64 CPU / 256.0 GiB',
        'hourlyCost': 3.803
    }, {
        'id': 'C4Large',
        'path': 'sandbox/instance-type/C4Large',
        'name': 'c4.large',
        'description': '2 CPU / 3.75 GiB',
        'hourlyCost': 0.113
    }, {
        'id': 'C4Xlarge',
        'path': 'sandbox/instance-type/C4Xlarge',
        'name': 'c4.xlarge',
        'description': '4 CPU / 7.5 GiB',
        'hourlyCost': 0.226
    }, {
        'id': 'C42xlarge',
        'path': 'sandbox/instance-type/C42xlarge',
        'name': 'c4.2xlarge',
        'description': '8 CPU / 15.0 GiB',
        'hourlyCost': 0.453
    }, {
        'id': 'C44xlarge',
        'path': 'sandbox/instance-type/C44xlarge',
        'name': 'c4.4xlarge',
        'description': '16 CPU / 30.0 GiB',
        'hourlyCost': 0.905
    }, {
        'id': 'C48xlarge',
        'path': 'sandbox/instance-type/C48xlarge',
        'name': 'c4.8xlarge',
        'description': '36 CPU / 60.0 GiB',
        'hourlyCost': 1.811
    }, {
        'id': 'R4Large',
        'path': 'sandbox/instance-type/R4Large',
        'name': 'r4.large',
        'description': '2 CPU / 15.25 GiB',
        'hourlyCost': 0.148
    }, {
        'id': 'R4Xlarge',
        'path': 'sandbox/instance-type/R4Xlarge',
        'name': 'r4.xlarge',
        'description': '4 CPU / 30.5 GiB',
        'hourlyCost': 0.296
    }, {
        'id': 'R42xlarge',
        'path': 'sandbox/instance-type/R42xlarge',
        'name': 'r4.2xlarge',
        'description': '8 CPU / 61.0 GiB',
        'hourlyCost': 0.593
    }, {
        'id': 'R44xlarge',
        'path': 'sandbox/instance-type/R44xlarge',
        'name': 'r4.4xlarge',
        'description': '16 CPU / 122.0 GiB',
        'hourlyCost': 1.186
    }, {
        'id': 'R48xlarge',
        'path': 'sandbox/instance-type/R48xlarge',
        'name': 'r4.8xlarge',
        'description': '32 CPU / 244.0 GiB',
        'hourlyCost': 2.371
    }, {
        'id': 'R416xlarge',
        'path': 'sandbox/instance-type/R416xlarge',
        'name': 'r4.16xlarge',
        'description': '64 CPU / 488.0 GiB',
        'hourlyCost': 4.742
    }, {
        'id': 'X116xlarge',
        'path': 'sandbox/instance-type/X116xlarge',
        'name': 'x1.16xlarge',
        'description': '64 CPU / 976.0 GiB',
        'hourlyCost': 8.003
    }, {
        'id': 'X132xlarge',
        'path': 'sandbox/instance-type/X132xlarge',
        'name': 'x1.32xlarge',
        'description': '128 CPU / 1920.0 GiB',
        'hourlyCost': 16.006
    }],
    'spending': {
        'monthlyInstanceBudget': 1.0,
        'monthlyInstanceSpending': 0.025,
        'monthlyStorageBudget': 1.0,
        'monthlyStorageSpending': 2.233275753451851E-5,
        'storageQuota': 20.0,
        'storageUsed': 9.6E-5
    }
}
